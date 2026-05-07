#!/usr/bin/env node
// Moderation CLI for the Gap in SE Map encrypted submission system.
//
// Usage:
//   GAPINSEMAP_API=https://your-worker.example.workers.dev \
//   GAPINSEMAP_ADMIN_TOKEN=...                            \
//   node tools/moderate.mjs
//
// Or set both in ~/.gapinsemap/config.json (chmod 600):
//   { "api": "https://...", "adminToken": "..." }
//
// Flow:
//   1. Read encrypted private key from ~/.gapinsemap/privkey.enc.
//   2. Prompt for the passphrase you set during keygen. Decrypt the privkey.
//   3. Fetch /pending from the Worker.
//   4. For each: derive the AES key from ECDH(eph_pub, our_priv), decrypt.
//   5. Show the decrypted submission. Prompt approve/reject.
//   6. On approve: append to testimonials.json (in the cwd repo) and POST
//      /moderate/:id with decision=approved. On reject: POST decision=rejected.
//   7. After the batch: stage testimonials.json, commit, prompt to push.
//
// The private key never leaves this process. The Worker only ever sees ciphertext.

import { webcrypto as crypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin, stdout, stderr, exit } from "node:process";
import readline from "node:readline";
import { execFileSync } from "node:child_process";

const VERSION = "gapinsemap-v1";
const KEY_FILE = join(homedir(), ".gapinsemap", "privkey.enc");
const CONFIG_FILE = join(homedir(), ".gapinsemap", "config.json");

// ---------- helpers ----------
const b64 = {
  encode: (b) => Buffer.from(b).toString("base64"),
  decode: (s) => new Uint8Array(Buffer.from(s, "base64")),
};

function prompt(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    if (silent) {
      const origWrite = stdout.write.bind(stdout);
      stdout.write = (chunk, ...rest) => {
        if (typeof chunk === "string" && chunk.length === 1 && chunk !== "\n" && chunk !== "\r") return true;
        return origWrite(chunk, ...rest);
      };
      rl.question(question, (answer) => {
        stdout.write = origWrite;
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => { rl.close(); resolve(answer); });
    }
  });
}

async function loadConfig() {
  let cfg = {};
  if (existsSync(CONFIG_FILE)) {
    try { cfg = JSON.parse(await readFile(CONFIG_FILE, "utf8")); } catch {}
  }
  const api = process.env.GAPINSEMAP_API || cfg.api;
  const adminToken = process.env.GAPINSEMAP_ADMIN_TOKEN || cfg.adminToken;
  if (!api || !adminToken) {
    stderr.write(
      "Configure GAPINSEMAP_API and GAPINSEMAP_ADMIN_TOKEN (env or " +
      CONFIG_FILE + ").\n"
    );
    exit(1);
  }
  return { api: api.replace(/\/$/, ""), adminToken };
}

async function unlockPrivateKey(passphrase) {
  if (!existsSync(KEY_FILE)) {
    stderr.write(`No key file at ${KEY_FILE}. Run tools/keygen.mjs first.\n`);
    exit(1);
  }
  const data = JSON.parse(await readFile(KEY_FILE, "utf8"));
  if (data.version !== VERSION) {
    stderr.write(`Key file version mismatch: ${data.version}\n`);
    exit(1);
  }
  const salt = b64.decode(data.kdf.salt);
  const nonce = b64.decode(data.nonce);
  const ciphertext = b64.decode(data.ciphertext);

  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: data.kdf.iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  let pkcs8;
  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ciphertext)
    );
  } catch {
    stderr.write("Wrong passphrase, or the file is corrupted.\n");
    exit(1);
  }
  const privKey = await crypto.subtle.importKey(
    "pkcs8", pkcs8, { name: "X25519" }, false, ["deriveBits"]
  );
  return { privKey, publicKeyB64: data.publicKey };
}

async function decryptSubmission(privKey, ourPubB64, entry) {
  const ephPubBytes = b64.decode(entry.eph_pub);
  const recipientPubBytes = b64.decode(ourPubB64);

  const ephPub = await crypto.subtle.importKey(
    "raw", ephPubBytes, { name: "X25519" }, false, []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "X25519", public: ephPub }, privKey, 256)
  );

  const salt = new Uint8Array(ephPubBytes.length + recipientPubBytes.length);
  salt.set(ephPubBytes, 0);
  salt.set(recipientPubBytes, ephPubBytes.length);

  const baseKey = await crypto.subtle.importKey(
    "raw", sharedSecret, "HKDF", false, ["deriveBits"]
  );
  const aesKeyRaw = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(VERSION) },
      baseKey,
      256
    )
  );
  const aesKey = await crypto.subtle.importKey(
    "raw", aesKeyRaw, { name: "AES-GCM" }, false, ["decrypt"]
  );
  const nonce = b64.decode(entry.nonce);
  const ciphertext = b64.decode(entry.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: ephPubBytes },
    aesKey,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ---------- main ----------
async function main() {
  const cfg = await loadConfig();
  const passphrase = await prompt("Passphrase for private key: ", { silent: true });
  const { privKey, publicKeyB64 } = await unlockPrivateKey(passphrase);

  const res = await fetch(cfg.api + "/pending", {
    headers: { authorization: "Bearer " + cfg.adminToken },
  });
  if (!res.ok) {
    stderr.write(`Worker returned ${res.status}: ${await res.text()}\n`);
    exit(1);
  }
  const { entries } = await res.json();
  if (!entries || !entries.length) {
    console.log("No pending submissions. Nothing to moderate.");
    return;
  }
  console.log(`\n${entries.length} pending submission(s).\n`);

  const testimonialsPath = "testimonials.json";
  const testimonials = JSON.parse(await readFile(testimonialsPath, "utf8"));
  testimonials.entries = testimonials.entries || [];

  let approved = 0, rejected = 0, skipped = 0;

  for (const [i, entry] of entries.entries()) {
    let plaintext;
    try {
      plaintext = await decryptSubmission(privKey, publicKeyB64, entry);
    } catch (err) {
      console.error(`  ! decryption failed for ${entry.id}: ${err.message}`);
      skipped++;
      continue;
    }

    console.log(`\n────────  ${i + 1} / ${entries.length}  ────────`);
    console.log(`ID:        ${entry.id}`);
    console.log(`Submitted: ${new Date(entry.created_at).toISOString()}`);
    console.log(`Area:      ${entry.area}`);
    console.log(`Name:      ${plaintext.name || "(none)"}`);
    console.log(`Email:     ${plaintext.email || "(none)"}`);
    console.log(`Postcode:  ${plaintext.postcode || "(none)"}`);
    console.log(`Resident:  ${plaintext.resident || "(unchecked)"}`);
    if (plaintext.testimonial) {
      console.log(`\nTestimonial:`);
      console.log(`  ${(plaintext.testimonial || "").trim().split("\n").join("\n  ")}`);
      console.log(`Display:   ${plaintext.displayMode || "anonymous"}`);
      console.log(`Consent:   ${plaintext.testimonialConsent || "(none)"}`);
    } else {
      console.log(`(sign-up only — no testimonial)`);
    }

    const choice = (await prompt(
      "\n[a]pprove publish · [r]eject · [s]ave-signup-only · [k]skip without API call · [q]uit: "
    )).trim().toLowerCase();

    if (choice === "q") break;
    if (choice === "k") { skipped++; continue; }

    if (choice === "a" && plaintext.testimonial && plaintext.testimonialConsent === "yes") {
      const display = plaintext.displayMode || "anonymous";
      let displayName = null;
      if (display === "firstname") {
        displayName = (plaintext.name || "").split(" ")[0] || "Anonymous";
      } else if (display === "full") {
        displayName = plaintext.name || "Anonymous";
      }
      testimonials.entries.push({
        id: entry.id,
        quote: plaintext.testimonial.trim(),
        area: entry.area,
        displayName,
        verified: true,
        date: new Date().toISOString().slice(0, 10),
      });
      await postModerate(cfg, entry.id, "approved");
      approved++;
      console.log("  ✓ approved + added to testimonials.json");
    } else if (choice === "s") {
      await postModerate(cfg, entry.id, "approved");
      approved++;
      console.log("  ✓ marked as approved (signup-only, no testimonial published)");
    } else if (choice === "r") {
      await postModerate(cfg, entry.id, "rejected");
      rejected++;
      console.log("  ✗ rejected");
    } else {
      console.log("  (skipped — no valid choice)");
      skipped++;
    }
  }

  if (approved > 0) {
    await writeFile(testimonialsPath, JSON.stringify(testimonials, null, 2) + "\n");
    console.log(`\nWrote ${testimonials.entries.length} entries to ${testimonialsPath}`);
    const doCommit = (await prompt("Commit and push now? [y/N]: ")).trim().toLowerCase();
    if (doCommit === "y") {
      try {
        execFileSync("git", ["add", testimonialsPath], { stdio: "inherit" });
        const msg = `content: ${approved} approved testimonial${approved === 1 ? "" : "s"}`;
        execFileSync("git", ["commit", "-m", msg], { stdio: "inherit" });
        execFileSync("git", ["push"], { stdio: "inherit" });
        console.log("Pushed.");
      } catch (e) {
        console.error("Git push failed:", e.message);
      }
    }
  }

  console.log(`\nSummary: ${approved} approved, ${rejected} rejected, ${skipped} skipped.\n`);
}

async function postModerate(cfg, id, decision) {
  const r = await fetch(`${cfg.api}/moderate/${id}`, {
    method: "POST",
    headers: {
      authorization: "Bearer " + cfg.adminToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ decision }),
  });
  if (!r.ok) throw new Error(`moderate API ${r.status}: ${await r.text()}`);
}

main().catch((err) => {
  stderr.write("Fatal: " + (err && err.message) + "\n");
  exit(1);
});
