const { getBaseUrl, getAccessToken } = require("./_lib/paypal");

const PRICE_EUR = process.env.PRODUCT_PRICE_EUR || "19.90"; // decimal string, PayPal wants "19.90" not cents
const PRODUCT_NAME = "telc B2 – 50 Original-Musterprüfungen + FSP Trainer";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;

  try {
    const accessToken = await getAccessToken();

    const res = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: PRODUCT_NAME,
            amount: { currency_code: "EUR", value: PRICE_EUR },
          },
        ],
        application_context: {
          return_url: `${siteUrl}/?paypal=return`,
          cancel_url: `${siteUrl}/?paypal=cancelled`,
          user_action: "PAY_NOW",
          brand_name: "telc B2 Prüfungstrainer",
        },
      }),
    });

    const order = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "paypal_error", detail: order }) };
    }

    const approveLink = (order.links || []).find((l) => l.rel === "approve");
    if (!approveLink) {
      return { statusCode: 502, body: JSON.stringify({ error: "no_approve_link", detail: order }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approveUrl: approveLink.href, orderId: order.id }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "request_failed", detail: String(err.message || err) }) };
  }
};
