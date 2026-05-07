# Moderation, deployment & key management

End-to-end-encrypted submission system. The website never sends plaintext to anyone but you. The moderator (you) holds a private key on a single laptop. Without it, no submission is readable — by us, by Cloudflare, or by anyone else.

---

## One-time setup

Do this once, before the encrypted form goes live. Total time: ~30 minutes.

### 1. Generate your keypair

```sh
cd /Users/luke/dev/gapinsemap
node tools/keygen.mjs
```

You'll be prompted for a passphrase — pick something long, memorable, and *not* a password you use elsewhere. The script writes:

- `~/.gapinsemap/privkey.enc` — your encrypted private key, AES-256-GCM with a PBKDF2-derived key.
- Prints the public key to stdout. **Paste it into `data.js` as `crypto.publicKey`**.

**Back up `privkey.enc` immediately.** Options:
- A USB stick stored offline.
- A 1Password attachment (1Password's encryption-at-rest is solid).
- A printed QR code of the file's base64 contents in a fireproof safe.

If you lose this file *and* the passphrase, every encrypted submission becomes permanently unreadable.

### 2. Install Cloudflare's `wrangler` CLI

```sh
npm install -g wrangler
wrangler login   # opens browser to authenticate against your CF account
```

### 3. Create a D1 database + KV namespace

```sh
cd /Users/luke/dev/gapinsemap/worker

wrangler d1 create gapinsemap
# → outputs a `database_id`. Paste it into wrangler.toml.

wrangler kv:namespace create RATELIMIT
# → outputs an `id`. Paste it into wrangler.toml.

# Apply the schema
wrangler d1 execute gapinsemap --file=./schema.sql
```

### 4. Set the Worker secrets

```sh
# Per-IP hash salt — generate fresh:
openssl rand -hex 32 | wrangler secret put IP_HASH_SALT

# Admin token — used by the moderation CLI. Generate fresh:
openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN
# COPY this value somewhere safe (1Password). You'll need it on your laptop.
```

### 5. Deploy

```sh
wrangler deploy
# → outputs your Worker URL, e.g.
# https://gapinsemap-api.czaku.workers.dev
```

Paste that URL into `data.js` as `api.url`.

### 6. Save the moderation config locally

```sh
mkdir -p ~/.gapinsemap
chmod 700 ~/.gapinsemap
cat > ~/.gapinsemap/config.json <<EOF
{
  "api": "https://gapinsemap-api.czaku.workers.dev",
  "adminToken": "PASTE_ADMIN_TOKEN_HERE"
}
EOF
chmod 600 ~/.gapinsemap/config.json
```

### 7. Commit + push

```sh
git add data.js worker/wrangler.toml
git commit -m "config: wire frontend to live Worker + public key"
git push
```

The site is now collecting real, encrypted submissions.

---

## Daily moderation routine

Whenever you want to process the queue:

```sh
cd /Users/luke/dev/gapinsemap
node tools/moderate.mjs
```

You'll be prompted for the passphrase. The CLI then:

1. Fetches all pending submissions from the Worker (encrypted blobs).
2. For each, decrypts locally using your private key.
3. Shows you the decrypted name, email, postcode, optional testimonial, and consent flags.
4. You decide:
   - **`a` — approve & publish testimonial.** Adds to `testimonials.json` using the display preference the resident chose (anonymous / firstname+area / fullname+area). Marks Worker entry as approved.
   - **`s` — approve as signup-only.** Counts towards the headline number; no testimonial gets published.
   - **`r` — reject.** Marks the Worker entry as rejected. Use for spam, abusive content, or unverifiable submissions.
   - **`k` — skip.** Leaves the entry pending; comes back next time.
   - **`q` — quit.** Stops the loop.
5. After the batch: the CLI offers to commit + push `testimonials.json`. The site rebuilds via the Pages workflow within ~60s.

### Verification policy

Before approving a *testimonial* (sign-ups don't need this), email the resident asking for proof of address — any one of:
- Council tax bill
- Utility bill (gas/electric/water)
- Tenancy agreement
- Electoral register entry

Postcode in the form alone is not enough — fraud-resistance matters when the campaign is being cited at the Mayor and TfL.

---

## What's stored where

| Where | Plaintext | Ciphertext |
|---|---|---|
| Browser memory (during submit) | Form data, ephemeral keys | — |
| Network (HTTPS) | Postcode district + PoW proof | Encrypted form payload |
| Worker (Cloudflare) | Postcode district, status, timestamps | Encrypted form payload |
| D1 database | Postcode district, status, timestamps | Encrypted form payload |
| `testimonials.json` (public, in repo) | Approved testimonials only, in the display form the resident chose | — |
| Your laptop (during moderation) | Decrypted data — only while CLI is running | — |
| `~/.gapinsemap/privkey.enc` | — | Your private key (passphrase-encrypted) |

---

## Key management

- **Use full-disk encryption** on your laptop (FileVault on macOS, BitLocker on Windows).
- **Don't email the private key** to yourself. Don't put it in a chat. Don't `cat` it into a Slack channel.
- **Rotate the admin token** every ~3 months: `openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN`, then update `~/.gapinsemap/config.json`.
- **Don't rotate the encryption keypair** unless the private key is compromised — rotation invalidates every still-pending submission. If you do need to rotate:
  1. Generate a new keypair.
  2. Drain the queue using the *old* key first.
  3. Update `data.js` with the new public key.
  4. From now on, only the new key works.

---

## Stats updates

The headline counter and `/stats.html` page pull from the Worker's `/count` endpoint — they update automatically from the live D1 database. **You don't need to maintain `stats.json` once the Worker is live.** It's there as a fallback for when the API isn't reachable.

If you want to add a manual "milestones" tracker, edit `stats.json`:

```json
{ "signups": 1247, "milestones": ["First 100: 2026-05-15", "First 1000: 2026-06-21"] }
```

---

## Things to add later

- **Email confirmation flow.** Currently a sign-up doesn't send an email back. Adding one (via Cloudflare Email Routing or Resend) costs nothing and confirms the email is real.
- **Tagged labels in moderation.** "spam", "needs-followup", "approved-pending-verification" — useful as the queue grows.
- **A read-only admin web UI** that shows the queue depth and last activity, but never decrypts. Cheap addition.
- **Audit log.** Append-only log of every approve/reject decision, signed by the admin token, kept in a separate D1 table.

None of these are needed at launch. Start manual. Automate when manual hurts.
