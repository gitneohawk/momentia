import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const runtime = "nodejs"; // Edge不可: 署名検証に生ボディが必要

export async function POST(req: Request) {
  // 1) 署名ヘッダ & シークレット
  const sig = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return new NextResponse("Missing signature or secret", { status: 400 });
  }

  // 2) 生ボディを確実に取得（Bufferで渡す）
  // Azure Container Apps でも改行やエンコーディング差分を避けるため Buffer を使う
  const bodyArrayBuffer = await req.arrayBuffer();
  const rawBody = Buffer.from(bodyArrayBuffer);

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    // 署名不一致の詳細を返す（Stripe の再送が有効）
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // session を展開して必要フィールドを取得
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent", "line_items"],
    });

    const email = full.customer_details?.email ?? null;
    const meta = full.metadata ?? {};
    const pi = typeof full.payment_intent === "string" ? null : full.payment_intent;
    const shipping = pi?.shipping ?? null;

    try {
      const amountJpy = full.amount_total ?? 0; // JPY は最小単位＝円
      await prisma.order.upsert({
        where: { sessionId: full.id },
        update: {},
        create: {
          sessionId: full.id,
          paymentIntentId:
            typeof full.payment_intent === "string"
              ? full.payment_intent
              : full.payment_intent?.id ?? null,
          itemType: (meta as any)?.itemType ?? "unknown",
          name: (meta as any)?.name ?? null,
          slug: (meta as any)?.slug ?? null,
          email,
          amountJpy,
          currency: full.currency ?? "jpy",
          shipping: shipping as any,
          metadata: meta as any,
        },
      });
      console.log("[webhook] order saved:", {
        sessionId: full.id,
        email,
        slug: (meta as any)?.slug,
      });
    } catch (dbErr) {
      console.error("[webhook] failed to save order", dbErr);
      return new NextResponse("DB Error", { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}