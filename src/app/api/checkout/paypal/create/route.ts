import { NextResponse } from "next/server";

// --- Pricing/behavior map ---
const PRICE_MAP = {
  "DIG-3000PX": {
    value: "5000",
    labelPrefix: "Digital",
    category: "DIGITAL_GOODS" as const,
    requiresShipping: false as const,
    intent: "CAPTURE" as const,
  },
  "PRT-A2-PANEL": {
    value: "50000",
    labelPrefix: "A2 Panel",
    category: "PHYSICAL_GOODS" as const,
    requiresShipping: true as const,
    intent: "AUTHORIZE" as const,
  },
};

type SkuKey = keyof typeof PRICE_MAP;

// --- Minimal JP-only validators ---
function isValidPostalCodeJP(value: string) {
  return /^\d{3}-?\d{4}$/.test(value || "");
}
function isValidPhoneJP(value: string) {
  return /^0\d{1,4}-?\d{1,4}-?\d{4}$/.test(value || "");
}

// --- Types ---
interface CreateBody {
  sku?: string;          // MUST be one of SkuKey
  photoSlug?: string;    // for labeling
  quantity?: number;     // default 1
  shipping?: {
    full_name: string;
    address_line_1: string;
    address_line_2?: string;
    admin_area_2: string; // city/ward
    admin_area_1: string; // prefecture
    postal_code: string;  // 105-0011
    country?: string;     // should be JP
    phone?: string;
  };
}

// Server-authoritative price + behavior
async function resolvePriceJpy(input: { sku?: string; photoSlug?: string }) {
  const key = (input.sku || "").toUpperCase() as SkuKey;
  const def = PRICE_MAP[key];
  if (!def) return null;
  const label = input.photoSlug
    ? `${def.labelPrefix}: ${input.photoSlug}`
    : `${def.labelPrefix}: ${key}`;
  return {
    sku: key,
    value: def.value,
    label,
    category: def.category,
    requiresShipping: def.requiresShipping,
    intent: def.intent,
  };
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const base = process.env.PAYPAL_BASE || "https://api-m.sandbox.paypal.com";
  if (!clientId || !secret) throw new Error("Missing PayPal credentials");

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const resp = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal token error: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return { accessToken: data.access_token as string, base };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;
    if (!body) return NextResponse.json({ error: "missing_body" }, { status: 400 });

    const price = await resolvePriceJpy({ sku: body.sku, photoSlug: body.photoSlug });
    if (!price) return NextResponse.json({ error: "price_not_found" }, { status: 400 });

    const qty = Math.max(1, Number(body.quantity || 1));
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) return NextResponse.json({ error: "missing_base_url" }, { status: 500 });

    // Validate JP shipping only when required
    let shippingInput = undefined as CreateBody["shipping"] | undefined;
    if (price.requiresShipping) {
      if (!body.shipping) return NextResponse.json({ error: "missing_shipping" }, { status: 400 });
      const s = body.shipping;
      if (String(s.country || "JP").toUpperCase() !== "JP") {
        return NextResponse.json({ error: "shipping_country_not_supported" }, { status: 400 });
      }
      if (!isValidPostalCodeJP(s.postal_code)) {
        return NextResponse.json({ error: "invalid_postal_code" }, { status: 400 });
      }
      if (s.phone && !isValidPhoneJP(s.phone)) {
        return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
      }
      shippingInput = s;
    }

    const { accessToken, base } = await getPayPalAccessToken();

    // Build order payload
    const unitAmount = (Number(price.value) * qty).toString();
    const orderPayload: any = {
      intent: price.intent,
      purchase_units: [
        {
          amount: {
            currency_code: "JPY",
            value: unitAmount,
            breakdown: { item_total: { currency_code: "JPY", value: unitAmount } },
          },
          items: [
            {
              name: price.label,
              unit_amount: { currency_code: "JPY", value: price.value },
              quantity: String(qty),
              category: price.category,
              sku: price.sku,
            },
          ],
        },
      ],
      application_context: {
        user_action: "PAY_NOW",
        return_url: `${baseUrl}/checkout/paypal/success`,
        cancel_url: `${baseUrl}/checkout/paypal/cancel`,
        brand_name: "Momentia",
        locale: "ja-JP",
        shipping_preference: price.requiresShipping
          ? "SET_PROVIDED_ADDRESS"
          : "NO_SHIPPING",
      },
    };

    if (price.requiresShipping && shippingInput) {
      orderPayload.purchase_units[0].shipping = {
        name: { full_name: shippingInput.full_name },
        address: {
          address_line_1: shippingInput.address_line_1,
          address_line_2: shippingInput.address_line_2 || "-",
          admin_area_2: shippingInput.admin_area_2,
          admin_area_1: shippingInput.admin_area_1,
          postal_code: shippingInput.postal_code,
          country_code: "JP",
        },
      };
    }

    const requestId = crypto.randomUUID();
    const resp = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
      },
      body: JSON.stringify(orderPayload),
      cache: "no-store",
    });

    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: "paypal_create_failed", detail: data }, { status: 502 });
    }

    const approveLink: string | undefined = (data.links || []).find((l: any) => l.rel === "approve")?.href;
    if (!approveLink) {
      return NextResponse.json({ error: "approve_link_not_found", detail: data }, { status: 502 });
    }

    // TODO: create pending order record in DB

    return NextResponse.json({ id: data.id, approveUrl: approveLink });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: String(e?.message || e) }, { status: 500 });
  }
}