export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";

// ---- ENV ----
const BASE = process.env.PAYPAL_BASE || "https://api-m.sandbox.paypal.com"; // prod: https://api-m.paypal.com
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID; // from PayPal dashboard

if (!WEBHOOK_ID) {
  // We don't throw at module load to avoid breaking build previews, but runtime will 500 if missing
  console.warn("[paypal] PAYPAL_WEBHOOK_ID is not set; webhook verification will fail.");
}

// ---- Helpers ----
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) throw new Error("Missing PayPal credentials");
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const resp = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`token ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.access_token as string;
}

async function verifyWebhookSignature(headers: Headers, body: any): Promise<boolean> {
  if (!WEBHOOK_ID) return false;
  const accessToken = await getPayPalAccessToken();
  const payload = {
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_time: headers.get("paypal-transmission-time"),
    cert_url: headers.get("paypal-cert-url"),
    auth_algo: headers.get("paypal-auth-algo"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    webhook_id: WEBHOOK_ID,
    webhook_event: body,
  };
  const resp = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    console.error("[paypal] verify failed", resp.status, await resp.text());
    return false;
  }
  const data = await resp.json();
  return data.verification_status === "SUCCESS";
}

async function getOrder(id: string) {
  const accessToken = await getPayPalAccessToken();
  const resp = await fetch(`${BASE}/v2/checkout/orders/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`getOrder ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

async function authorizeOrder(id: string) {
  const accessToken = await getPayPalAccessToken();
  const resp = await fetch(`${BASE}/v2/checkout/orders/${id}/authorize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`authorize ${resp.status} ${JSON.stringify(data)}`);
  // returns purchase_units[].payments.authorizations[0].id
  const authId = data.purchase_units?.[0]?.payments?.authorizations?.[0]?.id as string | undefined;
  if (!authId) throw new Error("authorize: missing authorization id");
  return authId;
}

async function captureOrder(id: string) {
  const accessToken = await getPayPalAccessToken();
  const resp = await fetch(`${BASE}/v2/checkout/orders/${id}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`capture order ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

async function captureAuthorization(authId: string) {
  const accessToken = await getPayPalAccessToken();
  const resp = await fetch(`${BASE}/v2/payments/authorizations/${authId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`capture auth ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

async function voidAuthorization(authId: string) {
  const accessToken = await getPayPalAccessToken();
  const resp = await fetch(`${BASE}/v2/payments/authorizations/${authId}/void`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text();
    throw new Error(`void auth ${resp.status} ${text}`);
  }
}

// Extract our SKU from the order (based on created payload)
function extractSku(order: any): string | undefined {
  try {
    return order.purchase_units?.[0]?.items?.[0]?.sku;
  } catch {
    return undefined;
  }
}

function extractCountry(order: any): string | undefined {
  try {
    return order.purchase_units?.[0]?.shipping?.address?.country_code;
  } catch {
    return undefined;
  }
}

// ---- Webhook entry ----
export const POST = async (req: Request) => {
  try {
    const raw = await req.text(); // we need raw for signature
    const body = JSON.parse(raw);

    // 1) Verify signature
    const ok = await verifyWebhookSignature(req.headers, body);
    if (!ok) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    const eventType = String(body.event_type || "");
    const orderId = body.resource?.id as string | undefined;

    // idempotency (TODO): record body.id as lastEventId in DB and skip if seen

    // We primarily care about approval/capture events. Handle APPROVED as the main trigger.
    if (eventType === "CHECKOUT.ORDER.APPROVED" && orderId) {
      const order = await getOrder(orderId);
      const sku = extractSku(order);
      const country = (extractCountry(order) || "").toUpperCase();

      if (sku === "DIG-3000PX") {
        // Digital: intent=CAPTURE → capture the order
        await captureOrder(orderId);
        // TODO: mark order paid in DB, issue SAS link, send email
        return NextResponse.json({ ok: true });
      }

      if (sku === "PRT-A2-PANEL") {
        // Physical: intent=AUTHORIZE
        const authId = await authorizeOrder(orderId);
        if (country === "JP") {
          await captureAuthorization(authId);
          // TODO: mark order paid + queue fulfillment
          return NextResponse.json({ ok: true });
        } else {
          await voidAuthorization(authId);
          // TODO: mark order voided/canceled in DB
          return NextResponse.json({ ok: true, voided: true });
        }
      }

      // Unknown SKU → do nothing but acknowledge
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Capture completion events can also arrive; acknowledge so PayPal stops retrying.
    if (
      eventType === "PAYMENT.CAPTURE.COMPLETED" ||
      eventType === "PAYMENT.AUTHORIZATION.CREATED" ||
      eventType === "PAYMENT.AUTHORIZATION.VOIDED"
    ) {
      return NextResponse.json({ ok: true });
    }

    // Default: acknowledge to avoid retries
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[paypal webhook] error", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
