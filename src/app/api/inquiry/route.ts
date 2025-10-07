import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma"; // 既存のPrisma helperがあればそれを使用
import xss from "xss"; // if not installed, keep fallback sanitizer below
import { sendMail } from "@/lib/mailer";
import { tplInquiryAutoReply, tplInquiryAdminNotice } from "@/lib/mail-templates";

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
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQ = 8; // max requests per window
type Bucket = { count: number; resetAt: number };
const buckets: Map<string, Bucket> = (globalThis as any).__inqBuckets ?? new Map();
(globalThis as any).__inqBuckets = buckets;

function rateLimit(ip: string): { ok: boolean; resetAt: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    const resetAt = now + WINDOW_MS;
    buckets.set(ip, { count: 1, resetAt });
    return { ok: true, resetAt };
  }
  if (b.count < MAX_REQ) {
    b.count++;
    return { ok: true, resetAt: b.resetAt };
  }
  return { ok: false, resetAt: b.resetAt };
}

// --- Sanitizers ---
const sanitize = (s: string) => xss(s, {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
});

export async function POST(req: Request) {
  try {
    // Basic Content-Type guard
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false },
        { status: 415, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    // Optional same-origin check (skip in dev if no env set)
    const allowedOrigin = process.env.NEXT_PUBLIC_BASE_URL; // e.g., https://momentia.evoluzio.com
    const origin = req.headers.get("origin");
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return NextResponse.json(
        { ok: false },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req as any).ip || "";
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, reason: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(),
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
    try {
      // ユーザー宛 自動返信
      const auto = tplInquiryAutoReply(saved.name || undefined);
      await sendMail({
        to: saved.email,
        subject: auto.subject,
        text: auto.text,
        html: auto.html,
      });

      // 運営宛 通知
      const admin = tplInquiryAdminNotice({
        name: saved.name ?? "(名無し)",
        email: saved.email,
        subject: saved.subject ?? undefined,
        message: saved.message,
      });
      await sendMail({
        to: process.env.ADMIN_NOTICE_TO || process.env.MAIL_REPLY_TO || "info@evoluzio.com",
        subject: admin.subject,
        text: admin.text,
        html: admin.html,
      });
    } catch (err) {
      // メール失敗は API を失敗にしない（ログのみ）
      console.error("[inquiry mail error]", err);
    }

    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return NextResponse.json(
        { ok: false, errors: e.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}