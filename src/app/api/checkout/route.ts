import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getToken } from 'next-auth/jwt';

export async function POST(req: NextRequest) {
  try {
    let { itemType, name, amountJpy, slug, customerEmail } = await req.json();

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

    if (slug !== undefined && slug !== null) {
      slug = String(slug).slice(0, 120);
    }

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
      console.warn('[checkout] blocked by ALLOWED_CHECKOUT_EMAILS', { email });
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    // ← ここで初期化（ビルド時には実行されない）
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error('Missing STRIPE_SECRET_KEY at runtime');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const stripe = new Stripe(secret);

    const rawBase = process.env.NEXT_PUBLIC_BASE_URL || '';
    const baseUrl = rawBase.replace(/\/+$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      customer_email: email,
      success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`,
      cancel_url: `${baseUrl}/purchase/cancel${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`,
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
        ...(slug ? { slug } : {}),
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