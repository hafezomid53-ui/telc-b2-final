const { getBaseUrl, getAccessToken, getConfigError } = require("./_lib/paypal");
const { createToken } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const orderId = body.orderId;
  if (!orderId) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_order_id" }) };
  }

  try {
    const configError = getConfigError();
    if (configError) {
      return { statusCode: 503, body: JSON.stringify({ error: "payment_not_configured", message: configError }) };
    }
    const accessToken = await getAccessToken();

    const res = await fetch(`${getBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const capture = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "paypal_error", detail: capture }) };
    }

    // THIS is the real trust boundary — only mint a token if PayPal itself
    // confirms the order is COMPLETED, never based on what the browser claims.
    if (capture.status !== "COMPLETED") {
      return { statusCode: 402, body: JSON.stringify({ error: "not_completed", status: capture.status }) };
    }

    const payerEmail = capture.payer?.email_address || orderId;
    const token = createToken(payerEmail);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "request_failed", detail: String(err.message || err) }) };
  }
};
