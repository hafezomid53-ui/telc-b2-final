/**
 * paypal.js — shared PayPal REST API helper
 * ============================================
 * Sandbox vs Live is controlled entirely by which base URL is used, which
 * in turn is controlled by the PAYPAL_ENV environment variable
 * ("sandbox" or "live"). Defaults to sandbox so nobody accidentally goes
 * live before they mean to.
 */

function getBaseUrl() {
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getConfigError() {
  const missing = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"].filter((key) => !process.env[key]);
  if (missing.length) return `PayPal is not configured. Missing environment variables: ${missing.join(", ")}`;
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  if (!["sandbox", "live"].includes(env)) return `Invalid PAYPAL_ENV "${env}". Use "sandbox" or "live".`;
  return null;
}

async function getAccessToken() {
  const configError = getConfigError();
  if (configError) throw new Error(configError);
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PayPal OAuth failed: ${res.status} ${detail}`);
  }
  const data = await res.json();
  return data.access_token;
}

module.exports = { getBaseUrl, getAccessToken, getConfigError };
