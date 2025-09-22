import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const runtime = "nodejs"; // ← Edge不可。生ボディが要るため

export async function POST(req: Request) {
  const sig = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const rawBody = await req.text(); // 署名検証は「生の文字列」必須

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret);
  } catch (e: any) {
    return new NextResponse(`Webhook Error: ${e.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Checkout Session を再取得して必要フィールドを展開
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent", "line_items"],
    });

    // 基本情報
    const email = full.customer_details?.email ?? null;
    const meta = full.metadata ?? {};

    // 送料・配送先などは PaymentIntent.shipping に存在
    const pi = typeof full.payment_intent === "string" ? null : full.payment_intent;
    const shipping = pi?.shipping ?? null; // Stripe.PaymentIntent['shipping'] | null

    // 注文をDBに保存（重複防止のため sessionId で upsert）
    try {
      const amountJpy = full.amount_total ?? 0; // JPYは最小単位＝円
      await prisma.order.upsert({
        where: { sessionId: full.id },
        update: {},
        create: {
          sessionId: full.id,
          paymentIntentId: typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id ?? null,
          itemType: (meta?.itemType as string) ?? "unknown",
          name: (meta?.name as string) ?? null,
          slug: (meta?.slug as string) ?? null,
          email,
          amountJpy,
          currency: (full.currency ?? "jpy"),
          shipping: shipping as any,
          metadata: meta as any,
        },
      });
      console.log("[webhook] order saved:", { sessionId: full.id, email, slug: meta?.slug });
    } catch (err) {
      console.error("[webhook] failed to save order", err);
      return new NextResponse("DB Error", { status: 500 });
    }

    // TODO: デジタルならダウンロードURL発行→メール通知（後続実装）
  }

  return NextResponse.json({ received: true });
}