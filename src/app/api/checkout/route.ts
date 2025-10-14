// --- security helpers ---
const MAX_BODY_BYTES = 10 * 1024; // 10KB
const ALLOWED_HOSTS = new Set([
  'www.momentia.photo',
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  if (!u || !d) return e;
  const head = u.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, u.length - 1))}@${d}`;
}

// very simple in-memory rate limiter per IP (60 req/min)
const rl = (globalThis as any).__momentiaCheckoutRL || new Map<string, { c: number; reset: number }>();
(globalThis as any).__momentiaCheckoutRL = rl;
const WINDOW_MS = 60_000;
const LIMIT = 60;
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = rl.get(ip);
  if (!rec || rec.reset < now) {
    rl.set(ip, { c: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (rec.c >= LIMIT) return false;
  rec.c += 1;
  return true;
}
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getToken } from 'next-auth/jwt';

export async function POST(req: NextRequest) {
  try {
    // Content-Length upper bound to avoid large payloads
    const cl = req.headers.get('content-length');
    if (cl && Number(cl) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'payload too large' }, { status: 413 });
    }

    // Only accept JSON
    const ctype = req.headers.get('content-type') || '';
    if (!ctype.toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'invalid content-type' }, { status: 415 });
    }

    // CSRF-lite: enforce allowed origin/host
    const origin = (req.headers.get('origin') || '').toLowerCase();
    const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return NextResponse.json({ error: 'forbidden host' }, { status: 403 });
    }
    if (origin && !ALLOWED_HOSTS.has(new URL(origin).host)) {
      return NextResponse.json({ error: 'forbidden origin' }, { status: 403 });
    }

    // IP-based rate limit (very lightweight)
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (!rateLimit(ip)) {
      const res = NextResponse.json({ error: 'too many requests' }, { status: 429 });
      res.headers.set('Retry-After', '60');
      return res;
    }

    const body = await req.json();
    const { itemType, amountJpy, slug, customerEmail } = body;
    let { name } = body;

    // Strict validations
    if (itemType !== 'digital' && itemType !== 'panel') {
      return NextResponse.json({ error: 'invalid itemType' }, { status: 400 });
    }

    if (
      typeof amountJpy !== 'number' ||
      !Number.isInteger(amountJpy) ||
      !Number.isFinite(amountJpy) ||
      amountJpy < 100 ||
      amountJpy > 2000000
    ) {
      return NextResponse.json({ error: 'invalid amount' }, { status: 400 });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    }
    name = name.trim().replace(/\r?\n/g, ' ').slice(0, 120);

    const safeSlug = slug != null ? String(slug).slice(0, 120) : undefined;

    // 入力された customerEmail を最優先に使用（未入力時のみログインメールをフォールバック）
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const tokenEmail = (token?.email as string | undefined) || undefined;
    const email = ((customerEmail && String(customerEmail)) || tokenEmail || '').trim().toLowerCase();

    // Basic email shape check: must contain '@' and a dot after it
    const atIndex = email.indexOf('@');
    if (atIndex < 1 || email.indexOf('.', atIndex) === -1) {
      return NextResponse.json({ error: 'メールアドレスを正しく入力してください。' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'メールアドレスを入力してください。' }, { status: 400 });
    }

    // 許可メール制限（環境変数にカンマ区切りで設定）
    const allowedRaw = process.env.ALLOWED_CHECKOUT_EMAILS || '';
    const allowed = allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(email)) {
      console.warn('[checkout] blocked by ALLOWED_CHECKOUT_EMAILS', { email: maskEmail(email) });
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    // ← ここで初期化（ビルド時には実行されない）
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error('Missing STRIPE_SECRET_KEY at runtime');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const stripe = new Stripe(secret);

    const xfProto = req.headers.get('x-forwarded-proto') || 'https';
    const xfHost = host; // from above
    const inferred = xfHost ? `${xfProto}://${xfHost}` : '';
    const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || inferred || '').trim();
    const baseUrl = rawBase.replace(/\/+$/, '');
    try {
      const h = new URL(baseUrl).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(h)) {
        return NextResponse.json({ error: 'baseUrl mismatch' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'invalid baseUrl' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      customer_email: email,
      success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}${safeSlug ? `&slug=${encodeURIComponent(safeSlug)}` : ''}`,
      cancel_url: `${baseUrl}/purchase/cancel${safeSlug ? `?slug=${encodeURIComponent(safeSlug)}` : ''}`,
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            unit_amount: amountJpy,
            product_data: { name },
          },
          quantity: 1,
        },
      ],
      metadata: {
        itemType,
        name,
        ...(safeSlug ? { slug: safeSlug } : {}),
      },
      ...(itemType === 'panel'
        ? { shipping_address_collection: { allowed_countries: ['JP'] } }
        : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}