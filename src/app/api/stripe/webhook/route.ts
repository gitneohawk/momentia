import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { sendMail } from "@/lib/mailer";
import { tplOrderDigitalUser, tplOrderPanelUser, tplOrderAdminNotice } from "@/lib/mail-templates";

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
  const bodyArrayBuffer = await req.arrayBuffer();
  const rawBody = Buffer.from(bodyArrayBuffer);

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[ALERT][STRIPE_WEBHOOK_ERROR][CONSTRUCT_EVENT]", {
      message: String(err),
    });
    // 署名不一致など
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.info("[STRIPE_WEBHOOK_RECEIVED]", { id: event.id, type: event.type });

  if (event.type === "checkout.session.completed") {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = event.data.object as Stripe.Checkout.Session;

    // session を展開して必要フィールドを取得
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent", "line_items"],
    });

    const email = full.customer_details?.email ?? null;
    const meta = (full.metadata ?? {}) as Record<string, string | undefined>;
    const pi = typeof full.payment_intent === "string" ? null : full.payment_intent;
    const shipping = pi?.shipping ?? null;

    const orderId = full.id;
    const itemType = (meta.itemType as "digital" | "panel" | undefined) ?? "unknown";
    const name = meta.name ?? null;
    const slug = meta.slug ?? null;

    console.info("[STRIPE_WEBHOOK_PROCESSING]", {
      id: event.id,
      type: event.type,
      orderId,
      itemType,
      slug,
    });

    // 金額・種別・商品情報（メタデータ想定: itemType, name, slug）
    const amountJpy = full.amount_total ?? 0; // JPY は最小単位＝円

    // デジタル用ダウンロードトークン（必要時のみ発行）
    let downloadToken: string | null = null;
    if (itemType === "digital") {
      downloadToken = crypto.randomBytes(32).toString("hex");
    }

    // 3) DB 保存（upsert）
    try {
      await prisma.order.upsert({
        where: { sessionId: full.id },
        update: {},
        create: {
          sessionId: full.id,
          paymentIntentId:
            typeof full.payment_intent === "string"
              ? full.payment_intent
              : full.payment_intent?.id ?? null,
          itemType,
          name,
          slug,
          email,
          amountJpy,
          currency: full.currency ?? "jpy",
          shipping: shipping as any,
          metadata: (full.metadata ?? {}) as any,
          downloadToken,
        },
      });
      console.info("[STRIPE_WEBHOOK_OK][DB_SAVED]", {
        orderId: full.id,
        itemType,
        slug,
      });
    } catch (dbErr) {
      console.error("[ALERT][STRIPE_WEBHOOK_ERROR][DB_SAVE_FAILED]", {
        orderId: full.id,
        itemType,
        slug,
        error: String(dbErr),
      });
      console.error("[webhook] failed to save order", dbErr);
      return new NextResponse("DB Error", { status: 500 });
    }

    // 4) メール送信（失敗しても 200 を返す。Stripe 側で重複送信されるため冪等に注意）
    try {
      const baseUrl =
        (process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
          (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : ""));
      const adminTo = process.env.ADMIN_NOTICE_TO || process.env.MAIL_FROM || "";

      if (itemType === "digital" && email) {
        // 購入者向け（ダウンロード）
        const downloadUrl =
          downloadToken && baseUrl ? `${baseUrl}/api/download?token=${downloadToken}` : "";

        const mail = tplOrderDigitalUser({
          title: name ?? "(no title)",
          slug: slug ?? "",
          downloadUrl,
          price: amountJpy,
          orderId: full.id,
        });

        await sendMail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        console.info("[STRIPE_WEBHOOK_OK][MAIL_SENT_USER]", {
          orderId: full.id,
          itemType,
          to: email,
        });

        // 管理者通知
        if (adminTo) {
          const adminMail = tplOrderAdminNotice({
            kind: "digital",
            title: name ?? "(no title)",
            slug: slug ?? "",
            email,
            amount: amountJpy,
            orderId: full.id,
          });
          await sendMail({
            to: adminTo,
            subject: adminMail.subject,
            html: adminMail.html,
            text: adminMail.text,
          });
          console.info("[STRIPE_WEBHOOK_OK][MAIL_SENT_ADMIN]", {
            orderId: full.id,
            itemType,
            to: adminTo,
          });
        }
      } else if (itemType === "panel" && email) {
        // 購入者向け（パネル）
        const eta = "約14日"; // 固定文言（必要ならメタデータ化）

        const mail = tplOrderPanelUser({
          title: name ?? "(no title)",
          price: amountJpy,
          eta,
          orderId: full.id,
        });

        await sendMail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        console.info("[STRIPE_WEBHOOK_OK][MAIL_SENT_USER]", {
          orderId: full.id,
          itemType,
          to: email,
        });

        // 管理者通知
        if (adminTo) {
          const adminMail = tplOrderAdminNotice({
            kind: "panel",
            title: name ?? "(no title)",
            slug: slug ?? "",
            email,
            amount: amountJpy,
            orderId: full.id,
          });
          await sendMail({
            to: adminTo,
            subject: adminMail.subject,
            html: adminMail.html,
            text: adminMail.text,
          });
          console.info("[STRIPE_WEBHOOK_OK][MAIL_SENT_ADMIN]", {
            orderId: full.id,
            itemType,
            to: adminTo,
          });
        }
      }
    } catch (mailErr) {
      // メール失敗はログのみ（Webhookは 200 を返す）
      console.error("[ALERT][STRIPE_WEBHOOK_ERROR][MAIL_FAILED]", {
        orderId: typeof (event as any)?.data?.object?.id === "string" ? (event as any).data.object.id : undefined,
        type: event.type,
        error: String(mailErr),
      });
    }
  } else {
    console.info("[STRIPE_WEBHOOK_IGNORED]", { id: event.id, type: event.type });
  }

  return NextResponse.json({ received: true });
}