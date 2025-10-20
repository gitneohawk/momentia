import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma"; // 既存のPrisma helperがあればそれを使用
import xss from "xss"; // if not installed, keep fallback sanitizer below
import { sendMail } from "@/lib/mailer";
import { tplInquiryAutoReply, tplInquiryAdminNotice } from "@/lib/mail-templates";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

const MAX_BODY_BYTES = 16 * 1024; // 16KB body cap
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  return `${u.slice(0, 1)}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
}

const inquiryLimiter = createRateLimiter({ prefix: "inquiry", limit: 8, windowMs: 10 * 60 * 1000 });

const headerSafe = (s: string) => !/[\r\n]/.test(s); // prevent header injection

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "お名前は必須です")
    .max(100, "お名前が長すぎます")
    .refine(headerSafe, "不正な文字が含まれています"),
  email: z
    .string()
    .trim()
    .email("メールアドレスの形式が不正です")
    .max(200, "メールアドレスが長すぎます")
    .refine(headerSafe, "不正な文字が含まれています"),
  subject: z
    .string()
    .trim()
    .max(200, "件名が長すぎます")
    .optional()
    .refine((v) => (v == null ? true : headerSafe(v)), "不正な文字が含まれています"),
  message: z
    .string()
    .min(1, "お問い合わせ内容は必須です")
    .max(4000, "本文が長すぎます")
    .refine((s) => typeof s === "string" && s.length > 0, "本文が必要です"),
  hpt: z.string().optional(), // honeypot（bot対策）
});

// --- Simple in-process rate limiter (per IP) ---
// Removed per instructions

// --- Sanitizers ---
const sanitize = (s: string) => xss(s, {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
});

const log = logger.child({ module: "api/inquiry" });

export async function POST(req: Request) {
  try {
    // Content-Length upper bound to protect parsing
    const cl = req.headers.get("content-length");
    if (cl && Number(cl) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false },
        { status: 413, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    // Basic Content-Type guard
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false },
        { status: 415, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    // Strict host/origin checks
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return NextResponse.json(
        { ok: false },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    const origin = (req.headers.get("origin") || "").toLowerCase();
    if (origin) {
      try {
        const oh = new URL(origin).host.toLowerCase();
        if (!ALLOWED_HOSTS.has(oh)) {
          return NextResponse.json(
            { ok: false },
            { status: 403, headers: { "Cache-Control": "no-store" } }
          );
        }
      } catch {
        return NextResponse.json(
          { ok: false },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // Rate limit (shared limiter)
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req as any).ip || "";
    const { ok: allowed, resetSec } = await inquiryLimiter.hit(ip || "unknown");
    if (!allowed) {
      return NextResponse.json(
        { ok: false, reason: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(resetSec),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const ua = req.headers.get("user-agent") ?? "";

    const json = await req.json();
    const data = schema.parse(json);

    // honeypot
    if (data.hpt) {
      return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const safeName = sanitize(data.name);
    const safeSubject = data.subject ? sanitize(data.subject) : undefined;
    const safeMsg = sanitize(data.message);

    const saved = await prisma.inquiry.create({
      data: {
        name: safeName,
        email: data.email,
        subject: safeSubject,
        message: safeMsg,
        ip,
        userAgent: ua,
      },
    });

    // 通知メール（Azure Communication Email）
    let autoReplySuccess = false;
    let autoReplyError: any = null;
    // ユーザー宛 自動返信
    try {
      const auto = tplInquiryAutoReply(saved.name || undefined);
      await sendMail({
        to: saved.email,
        subject: auto.subject,
        text: auto.text,
        html: auto.html,
      });
      autoReplySuccess = true;
      log.info("Inquiry auto-reply sent", { to: maskEmail(saved.email) });
    } catch (err) {
      autoReplySuccess = false;
      autoReplyError = err;
      log.error("Inquiry auto-reply failed", { to: maskEmail(saved.email), err: serializeError(err) });
    }

    // 運営宛 通知
    try {
      const admin = tplInquiryAdminNotice({
        name: saved.name ?? "(名無し)",
        email: saved.email,
        subject: saved.subject ?? undefined,
        message: saved.message,
      });

      // 自動返信の成否を追記して運営に送る
      const statusLineText = `\n---\n[auto-reply]: ${autoReplySuccess ? "succeeded" : "failed"}${autoReplySuccess ? "" : (autoReplyError ? ` (${String(autoReplyError)})` : "")}`;
      const statusLineHtml = `<hr/><p style="font-size:12px;color:#555">auto-reply: <b>${autoReplySuccess ? "succeeded" : "failed"}</b>${autoReplySuccess ? "" : (autoReplyError ? ` (${String(autoReplyError)})` : "")}</p>`;

      await sendMail({
        to: process.env.ADMIN_NOTICE_TO || process.env.MAIL_REPLY_TO || "info@evoluzio.com",
        subject: admin.subject,
        text: admin.text + statusLineText,
        html: admin.html + statusLineHtml,
      });

      log.info("Inquiry admin notice sent", {
        autoReply: autoReplySuccess ? "succeeded" : "failed",
        user: maskEmail(saved.email),
      });
    } catch (err) {
      log.error("Inquiry admin notice failed", {
        autoReply: autoReplySuccess ? "succeeded" : "failed",
        err: serializeError(err),
      });
    }

    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return NextResponse.json(
        { ok: false, errors: e.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    log.error("Inquiry handler failed", { err: serializeError(e) });
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
