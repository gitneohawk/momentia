import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { tplOrderDigitalUser, tplOrderPanelUser, tplOrderAdminNotice } from "@/lib/mail-templates";
import { logger, serializeError } from "@/lib/logger";

// --- security helpers / webhook hardening ---
const MAX_BODY_BYTES_WEBHOOK = 256 * 1024; // 256KB safety cap
const ALLOWED_HOSTS_WEB = new Set([
  'www.momentia.photo',
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function maskEmail(e: string | null | undefined) {
  if (!e) return e as any;
  const s = String(e);
  const [u, d] = s.split('@');
  if (!u || !d) return s;
  const head = u.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, u.length - 1))}@${d}`;
}

// Very simple in-memory idempotency guard (per process).
const seen = (globalThis as any).__momentiaStripeEvents || new Map<string, number>();
(globalThis as any).__momentiaStripeEvents = seen;
const SEEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
function alreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  // purge old
  for (const [k, t] of seen) {
    if (t < now) seen.delete(k);
  }
  if (seen.has(eventId)) return true;
  seen.set(eventId, now + SEEN_TTL_MS);
  return false;
}

export const runtime = "nodejs"; // Edge不可: 署名検証に生ボディが必要

const log = logger.child({ module: "api/stripe-webhook" });

type OrderSummary = {
  kind: "digital" | "panel";
  kindLabel: string;
  size: string | null;
  amountJpy: number;
};

function buildOrderSummary(args: {
  itemType: "digital" | "panel";
  amountJpy: number;
  size?: string | null;
}): OrderSummary {
  const { itemType, amountJpy, size } = args;
  return {
    kind: itemType,
    kindLabel: itemType === "panel" ? "パネルプリント" : "デジタル（商用可）",
    size: itemType === "panel" ? (size ?? null) : null,
    amountJpy,
  };
}

export async function POST(req: Request) {
  // Basic header validations before reading body
  const cl = req.headers.get('content-length');
  if (cl && Number(cl) > MAX_BODY_BYTES_WEBHOOK) {
    return new NextResponse('Payload too large', { status: 413 });
  }
  const ctype = (req.headers.get('content-type') || '').toLowerCase();
  if (ctype && !ctype.startsWith('application/json')) {
    return new NextResponse('Unsupported Media Type', { status: 415 });
  }

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
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret, 300); // 5 min tolerance
  } catch (err: any) {
    log.error("Stripe webhook signature verification failed", {
      err: serializeError(err),
    });
    // 署名不一致など
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  log.info("Stripe webhook received", { eventId: event.id, type: event.type });

  // Drop duplicates (Stripe retries) quickly in-process; DB upsert is a second layer
  if (alreadyProcessed(event.id)) {
    log.info("Stripe webhook duplicate ignored", { eventId: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Allowlist events
  if (event.type !== 'checkout.session.completed') {
    log.info("Stripe webhook ignored event type", { eventId: event.id, type: event.type });
    return NextResponse.json({ received: true });
  }

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
    const size = typeof meta.size === "string" ? meta.size : null;

    const maskedEmail = maskEmail(email);
    const logBase = {
      eventId: event.id,
      type: event.type,
      orderId,
      customerEmail: maskedEmail,
      itemType,
      slug,
    };

    log.info("Stripe webhook processing", logBase);

    // 金額・種別・商品情報（メタデータ想定: itemType, name, slug）
    const amountJpy = full.amount_total ?? 0; // JPY は最小単位＝円
    const orderSummary =
      itemType === "digital" || itemType === "panel"
        ? buildOrderSummary({ itemType, amountJpy, size })
        : null;

    // 3) DB 保存（upsert）: まず Order を確定し、その DB の id を取得
    let orderRecord: { id: string } | null = null;
    try {
      orderRecord = await prisma.order.upsert({
        where: { sessionId: full.id },
        update: {
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
        },
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
        },
        select: { id: true },
      });

      log.info("Stripe webhook order persisted", {
        ...logBase,
        dbId: orderRecord.id,
      });
    } catch (dbErr) {
      log.error("Stripe webhook order persistence failed", {
        ...logBase,
        err: serializeError(dbErr),
      });
      return new NextResponse("DB Error", { status: 500 });
    }

    // 4) AccessToken 発行（Order の DB id にひも付ける）—既存があれば再利用
    let invoiceTokenId: string | null = null;
    let accessTokenId: string | null = null;
    try {
      // 既存の invoice/digital を検索
      const [existingInvoice, existingDigital] = await Promise.all([
        prisma.accessToken.findFirst({
          where: { orderId: orderRecord!.id, kind: "invoice", revoked: false },
          select: { id: true },
        }),
        itemType === "digital"
          ? prisma.accessToken.findFirst({
              where: { orderId: orderRecord!.id, kind: "digital", revoked: false },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

      // 領収書（共通）
      if (existingInvoice) {
        invoiceTokenId = existingInvoice.id;
      } else {
        const inv = await prisma.accessToken.create({
          data: {
            orderId: orderRecord!.id,
            kind: "invoice",
            maxUses: 5,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90日
          },
          select: { id: true },
        });
        invoiceTokenId = inv.id;
      }

      // デジタル（必要時）
      if (itemType === "digital") {
        if (existingDigital) {
          accessTokenId = existingDigital.id;
        } else {
          const at = await prisma.accessToken.create({
            data: {
              orderId: orderRecord!.id,
              kind: "digital",
              maxUses: 3,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日
            },
            select: { id: true },
          });
          accessTokenId = at.id;
        }
      }
    } catch (tokErr) {
      log.error("Stripe webhook token issuance failed", {
        ...logBase,
        err: serializeError(tokErr),
      });
      // トークン発行失敗でも、後続（管理通知など）は進める
    }

    // 5) メール送信用の URL を準備
    // Safer base URL inference (prefer env; fallback to WEBSITE_HOSTNAME)
    const inferred = process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : '';
    const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || inferred || '').trim();
    const baseUrl = rawBase.replace(/\/+$/, '');
    try {
      const h = new URL(baseUrl).host.toLowerCase();
      if (!ALLOWED_HOSTS_WEB.has(h)) {
        log.warn("Stripe webhook base URL mismatch", { ...logBase, host: h });
        // proceed without URLs to avoid leaking wrong host
      }
    } catch {
      // if invalid, zero-out URLs below
    }
    const _invoiceUrl =
      invoiceTokenId && baseUrl ? `${baseUrl}/api/invoice?token=${invoiceTokenId}` : "";
    const _downloadUrl =
      accessTokenId && baseUrl ? `${baseUrl}/api/download?token=${accessTokenId}` : "";

    // 4) メール送信（失敗しても 200 を返す。Stripe 側で重複送信されるため冪等に注意）
    try {
      const adminTo = process.env.ADMIN_NOTICE_TO || process.env.MAIL_FROM || "";

      if (itemType === "digital" && email) {
        // 購入者向け（ダウンロード）
        const downloadUrl = _downloadUrl;

        const mail = tplOrderDigitalUser({
          title: name ?? "(no title)",
          slug: slug ?? "",
          downloadUrl,
          price: orderSummary?.amountJpy ?? amountJpy,
          kindLabel: orderSummary?.kindLabel,
          orderId: full.id,
        });

        // Append invoice link if available (without changing template types)
        const finalHtmlUser = _invoiceUrl
          ? `${mail.html}<p style="margin-top:12px">領収書PDF: <a href="${_invoiceUrl}">こちら</a></p>`
          : mail.html;
        const finalTextUser = _invoiceUrl
          ? `${mail.text}\n\n領収書PDF: ${_invoiceUrl}`
          : mail.text;

        await sendMail({
          to: email,
          subject: mail.subject,
          html: finalHtmlUser,
          text: finalTextUser,
        });
        log.info("Stripe webhook user mail sent", {
          ...logBase,
          to: maskEmail(email),
          hasAccessToken: Boolean(accessTokenId),
        });

        if (_invoiceUrl) {
          log.info("Stripe webhook invoice link attached", {
            ...logBase,
            invoiceLink: true,
          });
        }

        // 管理者通知
        if (adminTo) {
          const adminMail = tplOrderAdminNotice({
            kind: "digital",
            title: name ?? "(no title)",
            slug: slug ?? "",
            email,
            amount: orderSummary?.amountJpy ?? amountJpy,
            size: orderSummary?.size ?? null,
            orderId: full.id,
          });
          const adminHtml = _invoiceUrl
            ? `${adminMail.html}<p style="margin-top:8px">Invoice URL: <a href="${_invoiceUrl}">${_invoiceUrl}</a></p>`
            : adminMail.html;
          const adminText = _invoiceUrl
            ? `${adminMail.text}\n\nInvoice URL: ${_invoiceUrl}`
            : adminMail.text;
          await sendMail({
            to: adminTo,
            subject: adminMail.subject,
            html: adminHtml,
            text: adminText,
          });
          log.info("Stripe webhook admin mail sent", {
            ...logBase,
            to: maskEmail(adminTo),
            invoiceLink: Boolean(_invoiceUrl),
          });
        }
      } else if (itemType === "panel" && email) {
        // 購入者向け（パネル）
        const eta = "約14日"; // 固定文言（必要ならメタデータ化）

        const mail = tplOrderPanelUser({
          title: name ?? "(no title)",
          price: orderSummary?.amountJpy ?? amountJpy,
          eta,
          size: orderSummary?.size ?? size,
          orderId: full.id,
        });

        // Append invoice link if available
        const finalHtmlUser = _invoiceUrl
          ? `${mail.html}<p style="margin-top:12px">領収書PDF: <a href="${_invoiceUrl}">こちら</a></p>`
          : mail.html;
        const finalTextUser = _invoiceUrl
          ? `${mail.text}\n\n領収書PDF: ${_invoiceUrl}`
          : mail.text;

        await sendMail({
          to: email,
          subject: mail.subject,
          html: finalHtmlUser,
          text: finalTextUser,
        });
        log.info("Stripe webhook user mail sent", {
          ...logBase,
          to: maskEmail(email),
        });

        if (_invoiceUrl) {
          log.info("Stripe webhook invoice link attached", {
            ...logBase,
            invoiceLink: true,
          });
        }

        // 管理者通知
        if (adminTo) {
          const adminMail = tplOrderAdminNotice({
            kind: "panel",
            title: name ?? "(no title)",
            slug: slug ?? "",
            email,
            amount: orderSummary?.amountJpy ?? amountJpy,
            size: orderSummary?.size ?? size,
            orderId: full.id,
          });
          const adminHtml = _invoiceUrl
            ? `${adminMail.html}<p style="margin-top:8px">Invoice URL: <a href="${_invoiceUrl}">${_invoiceUrl}</a></p>`
            : adminMail.html;
          const adminText = _invoiceUrl
            ? `${adminMail.text}\n\nInvoice URL: ${_invoiceUrl}`
            : adminMail.text;
          await sendMail({
            to: adminTo,
            subject: adminMail.subject,
            html: adminHtml,
            text: adminText,
          });
          log.info("Stripe webhook admin mail sent", {
            ...logBase,
            to: maskEmail(adminTo),
            invoiceLink: Boolean(_invoiceUrl),
          });
        }
      }
    } catch (mailErr) {
      // メール失敗はログのみ（Webhookは 200 を返す）
      log.error("Stripe webhook mail delivery failed", {
        ...logBase,
        err: serializeError(mailErr),
      });
    }
  }

  return NextResponse.json({ received: true });
}
