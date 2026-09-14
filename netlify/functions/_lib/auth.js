/**
 * auth.js — shared access-token creation/verification
 * =====================================================
 * A paying customer gets a signed token after checkout (see verify-payment.js).
 * Every protected endpoint (exam.js, submit-exam.js, audio.js,
 * correct-writing.js) calls requireValidToken() before returning anything.
 *
 * Token format: base64url(payload) + "." + hex(HMAC-SHA256(payload, secret))
 * payload = { sub: <buyer email or id>, iat: <issued-at ms>, exp: <expiry ms> }
 *
 * This is deliberately simple (no external JWT library dependency) but uses
 * a real HMAC signature — a client cannot forge or extend a token without
 * knowing ACCESS_TOKEN_SECRET, which only lives in Netlify's server-side
 * environment variables, never in the deployed frontend.
 */

const crypto = require("crypto");

const SECRET = process.env.ACCESS_TOKEN_SECRET;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches the migration doc

function assertSecretConfigured() {
  if (!SECRET || SECRET.length < 32) {
    throw new Error(
      "ACCESS_TOKEN_SECRET is not set (or too short) in the function's environment. " +
      "Set a random string of at least 32 characters in Netlify site settings."
    );
  }
}

function sign(payloadStr) {
  return crypto.createHmac("sha256", SECRET).update(payloadStr).digest("hex");
}

function createToken(subject, ttlMs = DEFAULT_TTL_MS) {
  assertSecretConfigured();
  const now = Date.now();
  const payload = { sub: subject, iat: now, exp: now + ttlMs };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(payloadStr);
  return `${payloadStr}.${signature}`;
}

function verifyToken(token) {
  assertSecretConfigured();
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, reason: "malformed" };
  }
  const [payloadStr, signature] = token.split(".");
  const expectedSig = sign(payloadStr);

  // constant-time comparison to avoid timing side-channels
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }

  if (!payload.exp || Date.now() > payload.exp) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, subject: payload.sub, payload };
}

/**
 * Extracts "Bearer <token>" from a Netlify function event's headers and
 * verifies it. Returns { ok: true, subject } or { ok: false, error, status }
 * ready to be returned directly as an HTTP response body.
 */
function requireValidToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: "missing_authorization_header" };
  }
  const result = verifyToken(match[1]);
  if (!result.valid) {
    return { ok: false, status: 403, error: `invalid_token:${result.reason}` };
  }
  return { ok: true, subject: result.subject };
}

module.exports = { createToken, verifyToken, requireValidToken };
