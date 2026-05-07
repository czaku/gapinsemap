#!/usr/bin/env node
// One-time key generation for the Gap in SE Map encrypted submission system.
//
// Run: node tools/keygen.mjs
//
// Generates an X25519 keypair using Node's WebCrypto. The public key is printed
// to stdout (you paste it into data.js). The private key is encrypted with a
// passphrase you choose and written to ~/.gapinsemap/privkey.enc. The private
// key NEVER leaves this script in plaintext.
//
// Encryption: AES-256-GCM, key derived from passphrase via PBKDF2-SHA256
// (310,000 iterations — current OWASP recommendation as of 2024+). Random
// 16-byte salt per file. Random 12-byte nonce.
//
// If you lose the passphrase OR the file, every encrypted submission becomes
// permanently unreadable. Back up the file (a USB stick, 1Password attachment,
// secure cloud) AND remember the passphrase.

import { webcrypto as crypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import readline from "node:readline";
import { existsSync } from "node:fs";

const VERSION = "gapinsemap-v1";
const KDF_ITERATIONS = 310_000;
const OUT_DIR = join(homedir(), ".gapinsemap");
const OUT_FILE = join(OUT_DIR, "privkey.enc");

// ----- Helpers -----
const b64 = {
  encode: (bytes) => Buffer.from(bytes).toString("base64"),
  decode: (str) => new Uint8Array(Buffer.from(str, "base64")),
};

function prompt(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    if (silent) {
      // Mute echo for passphrase entry
      const origWrite = stdout.write.bind(stdout);
      stdout.write = (chunk, ...rest) => {
        if (typeof chunk === "string" && chunk.length === 1 && chunk !== "\n" && chunk !== "\r") {
          return true;
        }
        return origWrite(chunk, ...rest);
      };
      rl.question(question, (answer) => {
        stdout.write = origWrite;
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ----- Main -----
async function main() {
  console.log("\nGap in SE Map — keygen\n----------------------\n");

  // Non-interactive mode: passphrase via env var (for automation / CI).
  // Set GAPINSEMAP_KEYGEN_PASSPHRASE to skip the interactive prompts. The
  // value is still passed through the same KDF and storage path, so the
  // resulting key file is indistinguishable from one created interactively.
  const envPass = process.env.GAPINSEMAP_KEYGEN_PASSPHRASE;
  const envOverwrite = process.env.GAPINSEMAP_KEYGEN_OVERWRITE === "yes";

  if (existsSync(OUT_FILE)) {
    if (!envOverwrite) {
      const overwrite = await prompt(
        `An encrypted private key already exists at:\n  ${OUT_FILE}\n` +
        `Overwriting will permanently lose the ability to decrypt anything\n` +
        `that was encrypted with the previous key. Type YES to proceed: `
      );
      if (overwrite !== "YES") {
        console.log("Aborted.");
        process.exit(1);
      }
    }
  }

  let pass1;
  if (envPass) {
    pass1 = envPass;
    if (pass1.length < 12) {
      console.error("GAPINSEMAP_KEYGEN_PASSPHRASE must be at least 12 characters.");
      process.exit(1);
    }
    console.log("(passphrase taken from GAPINSEMAP_KEYGEN_PASSPHRASE env var)\n");
  } else {
    pass1 = await prompt("Choose a passphrase (input hidden): ", { silent: true });
    if (pass1.length < 12) {
      console.error("Passphrase must be at least 12 characters. Use a passphrase, not a password.");
      process.exit(1);
    }
    const pass2 = await prompt("Repeat passphrase: ", { silent: true });
    if (pass1 !== pass2) {
      console.error("Passphrases do not match. Aborted.");
      process.exit(1);
    }
  }

  // Generate X25519 keypair
  const keypair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);

  // Export raw bytes
  const pubRaw  = new Uint8Array(await crypto.subtle.exportKey("raw", keypair.publicKey));
  const privRaw = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keypair.privateKey));
  // Private key as PKCS8 DER (~48 bytes for X25519). PEM-style would be fine too.

  // Encrypt the private key with a passphrase-derived AES-GCM key
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKey(pass1, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, privRaw)
  );

  // File format: JSON wrapping all the parts. Version-tagged so we can rotate.
  const fileData = {
    version: VERSION,
    kdf: { name: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: b64.encode(salt) },
    cipher: "AES-256-GCM",
    nonce: b64.encode(nonce),
    ciphertext: b64.encode(ciphertext),
    publicKey: b64.encode(pubRaw),
    createdAt: new Date().toISOString(),
  };

  await mkdir(dirname(OUT_FILE), { recursive: true, mode: 0o700 });
  await writeFile(OUT_FILE, JSON.stringify(fileData, null, 2), { mode: 0o600 });

  // Print public key for the user to paste into data.js
  console.log("\n  ✓ Encrypted private key written to:");
  console.log("      " + OUT_FILE);
  console.log("\n  ✓ Public key (paste into data.js):");
  console.log("\n      campaign.crypto.publicKey = \"" + b64.encode(pubRaw) + "\";\n");
  console.log("Next steps:");
  console.log("  1. Back up " + OUT_FILE + " (USB stick, 1Password attachment).");
  console.log("  2. Memorise the passphrase. Without it, the file is useless.");
  console.log("  3. Paste the public key above into data.js (campaign.crypto.publicKey).");
  console.log("  4. Commit and push — the public key is safe to be public.");
  console.log("");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
