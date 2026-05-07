// Gap in SE Map — submission API Worker
//
// Endpoints:
//   POST /submit       — accept an encrypted submission. Verify PoW + rate-limit.
//   GET  /count        — public aggregate counts for the stats page (no PII).
//   GET  /pending      — list pending ciphertexts (admin auth required).
//   POST /moderate/:id — set status approved|rejected (admin auth required).
//   OPTIONS /*         — CORS preflight.
//
// The Worker only ever sees ciphertext for the form payload. The recipient
// private key lives on the moderator's laptop, not here.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const VERSION_TAG = "gapinsemap-v1";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/submit" && request.method === "POST") {
        return wrap(await handleSubmit(request, env), cors);
      }
      if (url.pathname === "/count" && request.method === "GET") {
        return wrap(await handleCount(env), cors, 60);
      }
      if (url.pathname === "/pending" && request.method === "GET") {
        return wrap(await handlePending(request, env), cors);
      }
      const m = url.pathname.match(/^\/moderate\/([A-Za-z0-9_-]{8,64})$/);
      if (m && request.method === "POST") {
        return wrap(await handleModerate(request, env, m[1]), cors);
      }
      return wrap({ error: "not_found" }, cors, 0, 404);
    } catch (err) {
      // Don't leak internals; return a stable shape.
      console.error("worker error:", err && err.message);
      return wrap({ error: "internal_error" }, cors, 0, 500);
    }
  },
};

// ---------- response helpers ----------
function wrap(body, cors, cacheSeconds = 0, status = 200) {
  // Handler shorthand: if the body has _status, use it as the HTTP status and
  // strip it from the JSON. Lets handlers return { _status: 400, error: "..." }
  // without manually building Response objects everywhere.
  if (body && typeof body === "object" && typeof body._status === "number") {
    status = body._status;
    const { _status, ...rest } = body;
    body = rest;
  }
  const headers = { ...JSON_HEADERS, ...cors };
  if (cacheSeconds > 0 && status === 200) {
    headers["cache-control"] = `public, max-age=${cacheSeconds}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const origin = request.headers.get("origin") || "";
  const ok = allowed.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin : allowed[0] || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

// ---------- /submit ----------
async function handleSubmit(request, env) {
  const body = await safeJson(request);
  if (!body) return { _status: 400, error: "bad_json" };

  const { v, ephPub, nonce, ciphertext, area, pow } = body;

  // Shape validation — keep cheap before doing crypto.
  if (v !== VERSION_TAG) return { _status: 400, error: "bad_version" };
  if (!isB64Bytes(ephPub, 32)) return { _status: 400, error: "bad_eph_pub" };
  if (!isB64Bytes(nonce, 12)) return { _status: 400, error: "bad_nonce" };
  if (!isB64Bytes(ciphertext, 1, 64 * 1024)) return { _status: 400, error: "bad_ciphertext" };
  if (typeof area !== "string" || !/^[A-Z0-9]{2,5}$/.test(area)) return { _status: 400, error: "bad_area" };
  if (!pow || typeof pow.challenge !== "string" || typeof pow.nonce !== "string") {
    return { _status: 400, error: "bad_pow" };
  }

  // PoW check: challenge must be `${ephPub}:${area}` and hash must have N leading zero bits
  const requiredDifficulty = parseInt(env.POW_DIFFICULTY || "18", 10);
  const expectedChallenge = `${ephPub}:${area}`;
  if (pow.challenge !== expectedChallenge) return { _status: 400, error: "pow_challenge_mismatch" };
  if (typeof pow.difficulty !== "number" || pow.difficulty < requiredDifficulty) {
    return { _status: 400, error: "pow_too_weak" };
  }
  const powOk = await verifyPow(pow.challenge, pow.nonce, requiredDifficulty);
  if (!powOk) return { _status: 400, error: "pow_invalid" };

  // Rate-limit per IP. We hash the IP with a server-side salt so the IP itself
  // is never persisted — the KV key is the hash, the value is the count.
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const ipHash = await sha256Hex(ip + "|" + (env.IP_HASH_SALT || ""));
  const rlKey = "rl:" + ipHash;
  const rlMax = parseInt(env.RATE_LIMIT_PER_IP_PER_HOUR || "5", 10);

  const current = parseInt((await env.RATELIMIT.get(rlKey)) || "0", 10);
  if (current >= rlMax) return { _status: 429, error: "rate_limited" };
  // 3600s TTL — auto-expires
  await env.RATELIMIT.put(rlKey, String(current + 1), { expirationTtl: 3600 });

  // Insert
  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO submissions (id, v, eph_pub, nonce, ciphertext, area, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(id, v, ephPub, nonce, ciphertext, area, Date.now()).run();

  return { ok: true, id };
}

// ---------- /count ----------
async function handleCount(env) {
  const rows = await env.DB.prepare(`SELECT key, value FROM counters`).all();
  const out = { total: 0, by_area: {}, by_status: {} };
  for (const r of rows.results || []) {
    if (r.key === "total") out.total = r.value;
    else if (r.key.startsWith("area:")) out.by_area[r.key.slice(5)] = r.value;
    else if (r.key.startsWith("status:")) out.by_status[r.key.slice(7)] = r.value;
  }
  // Recent activity: 14 daily buckets, count only (no IDs).
  const since = Date.now() - 14 * 86400_000;
  const dayBuckets = await env.DB.prepare(
    `SELECT (created_at / 86400000) AS day, COUNT(*) AS n
       FROM submissions
       WHERE created_at >= ?
       GROUP BY day
       ORDER BY day ASC`
  ).bind(since).all();
  out.recent_days = (dayBuckets.results || []).map((r) => ({
    day: r.day * 86400000,
    n: r.n,
  }));
  return out;
}

// ---------- /pending (admin) ----------
async function handlePending(request, env) {
  if (!checkAdmin(request, env)) return { _status: 401, error: "unauthorised" };
  const limit = 50;
  const rs = await env.DB.prepare(
    `SELECT id, v, eph_pub, nonce, ciphertext, area, created_at
       FROM submissions
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`
  ).bind(limit).all();
  return { entries: rs.results || [] };
}

// ---------- /moderate/:id (admin) ----------
async function handleModerate(request, env, id) {
  if (!checkAdmin(request, env)) return { _status: 401, error: "unauthorised" };
  const body = await safeJson(request);
  if (!body) return { _status: 400, error: "bad_json" };
  const decision = body.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return { _status: 400, error: "bad_decision" };
  }
  const r = await env.DB.prepare(
    `UPDATE submissions SET status = ?, moderated_at = ?
       WHERE id = ? AND status = 'pending'`
  ).bind(decision, Date.now(), id).run();
  if (!r.meta || r.meta.changes === 0) return { _status: 404, error: "not_found_or_already_moderated" };
  return { ok: true };
}

function checkAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const provided = m[1].trim();
  const expected = (env.ADMIN_TOKEN || "").trim();
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  // Constant-time-ish compare
  let acc = 0;
  for (let i = 0; i < provided.length; i++) acc |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return acc === 0;
}

// ---------- helpers ----------
async function safeJson(request) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const text = await request.text();
    if (text.length > 128 * 1024) return null;
    return JSON.parse(text);
  } catch { return null; }
}

function isB64Bytes(s, expectMin, expectMax) {
  if (typeof s !== "string") return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) return false;
  // Decode-length sanity check
  const padding = (s.endsWith("==") ? 2 : (s.endsWith("=") ? 1 : 0));
  const bytes = Math.floor((s.length * 3) / 4) - padding;
  if (expectMax === undefined) return bytes === expectMin;
  return bytes >= expectMin && bytes <= expectMax;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPow(challenge, nonceStr, difficulty) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(challenge + nonceStr)
  );
  const bytes = new Uint8Array(buf);
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) { bits += 8; continue; }
    let m = 0x80;
    while (m && (b & m) === 0) { bits++; m >>>= 1; }
    break;
  }
  return bits >= difficulty;
}

function randomId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
