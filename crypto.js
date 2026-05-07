// Frontend encryption for the Gap in SE Map sign-up form.
//
// What this does:
//   1. Solves a small proof-of-work puzzle (slows down bots; no fingerprinting).
//   2. Encrypts the form payload using X25519 + AES-256-GCM (hybrid scheme).
//   3. Returns the encrypted blob as base64 for POSTing to the Worker.
//
// Standard ECIES-style construction:
//   - Generate ephemeral X25519 keypair on each submission.
//   - shared = ECDH(eph_priv, recipient_pub).
//   - Derive AES-256 key via HKDF-SHA256 with salt = eph_pub || recipient_pub.
//   - Encrypt with AES-GCM, random 12-byte nonce.
//   - Send { eph_pub, nonce, ciphertext } — eph_priv is discarded.
//
// Only the holder of recipient_priv (= our moderator's laptop) can decrypt.
//
// All operations use the WebCrypto API; no third-party libraries.

(function () {
  const VERSION = "gapinsemap-v1";
  const POW_DIFFICULTY = 18; // ~250k hashes ≈ <1s on a modern laptop

  // Resolve the recipient public key from data.js (or fail loudly).
  function recipientPublicKeyB64() {
    const k = window.CAMPAIGN && window.CAMPAIGN.crypto && window.CAMPAIGN.crypto.publicKey;
    if (!k || k === "REPLACE_ME") {
      throw new Error(
        "Public key not configured. Run tools/keygen.mjs and paste the public key into data.js."
      );
    }
    return k;
  }

  // ----- base64 helpers -----
  function b64encode(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function b64decode(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ----- proof of work -----
  // We require SHA-256(challenge || nonce) to start with N zero bits.
  // Worker will verify by recomputing the same hash.
  async function solvePow(challenge, difficulty) {
    const enc = new TextEncoder();
    const challengeBytes = enc.encode(challenge);
    const required = difficulty;

    let nonce = 0;
    while (true) {
      const nonceStr = String(nonce);
      const buf = new Uint8Array(challengeBytes.length + nonceStr.length);
      buf.set(challengeBytes, 0);
      buf.set(enc.encode(nonceStr), challengeBytes.length);

      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hash = new Uint8Array(hashBuf);
      if (countLeadingZeroBits(hash) >= required) {
        return nonceStr;
      }
      nonce++;
    }
  }

  function countLeadingZeroBits(bytes) {
    let bits = 0;
    for (const b of bytes) {
      if (b === 0) { bits += 8; continue; }
      // Count leading zeros in this byte
      let m = 0x80;
      while (m && (b & m) === 0) { bits++; m >>>= 1; }
      break;
    }
    return bits;
  }

  // ----- HKDF-SHA256 -----
  async function hkdf(sharedSecret, salt, info, length) {
    const baseKey = await crypto.subtle.importKey(
      "raw", sharedSecret, "HKDF", false, ["deriveBits"]
    );
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
        baseKey,
        length * 8
      )
    );
  }

  // ----- main encrypt function -----
  async function encryptPayload(payloadObj) {
    const recipientPubBytes = b64decode(recipientPublicKeyB64());

    // Import recipient public key
    const recipientPub = await crypto.subtle.importKey(
      "raw", recipientPubBytes, { name: "X25519" }, false, []
    );

    // Generate ephemeral keypair
    const eph = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    const ephPubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));

    // ECDH
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "X25519", public: recipientPub }, eph.privateKey, 256)
    );

    // HKDF: salt = eph_pub || recipient_pub
    const salt = new Uint8Array(ephPubBytes.length + recipientPubBytes.length);
    salt.set(ephPubBytes, 0);
    salt.set(recipientPubBytes, ephPubBytes.length);
    const aesKeyRaw = await hkdf(sharedSecret, salt, VERSION, 32);

    const aesKey = await crypto.subtle.importKey(
      "raw", aesKeyRaw, { name: "AES-GCM" }, false, ["encrypt"]
    );

    // Encrypt
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: ephPubBytes },
        aesKey,
        plaintext
      )
    );

    return {
      v: VERSION,
      ephPub: b64encode(ephPubBytes),
      nonce: b64encode(nonce),
      ciphertext: b64encode(ciphertext),
    };
  }

  // ----- public API -----
  // Builds a complete submission body:
  //   { v, ephPub, nonce, ciphertext, area, pow: { challenge, nonce, difficulty } }
  // `area` is the postcode district (e.g. "SE17") — the only metadata we share
  // in plaintext, used for the public stats endpoint. Everything else is in the
  // ciphertext.
  async function buildSubmission(formData) {
    const area = derivePostcodeDistrict(formData.postcode || "");

    // Encrypt the full form payload
    const enc = await encryptPayload(formData);

    // Solve PoW. Challenge = ephPub || area (binds PoW to this submission).
    const challenge = enc.ephPub + ":" + area;
    const powNonce = await solvePow(challenge, POW_DIFFICULTY);

    return {
      v: enc.v,
      ephPub: enc.ephPub,
      nonce: enc.nonce,
      ciphertext: enc.ciphertext,
      area,
      pow: { challenge, nonce: powNonce, difficulty: POW_DIFFICULTY },
    };
  }

  function derivePostcodeDistrict(postcode) {
    const cleaned = String(postcode || "").toUpperCase().replace(/\s+/g, "");
    const m = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
    return m ? m[1] : "UNKNOWN";
  }

  // Expose
  window.CAMPAIGN_CRYPTO = {
    buildSubmission,
    derivePostcodeDistrict,
    VERSION,
    POW_DIFFICULTY,
  };
})();
