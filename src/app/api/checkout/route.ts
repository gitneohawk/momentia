import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const { itemType, name, amountJpy, slug, customerEmail } = await req.json();

    // 許可メール制限（環境変数にカンマ区切りで設定）
    const allowedRaw = process.env.ALLOWED_CHECKOUT_EMAILS || '';
    const allowed = allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length > 0) {
      if (!customerEmail || !allowed.includes(customerEmail)) {
        console.warn('[checkout] blocked by ALLOWED_CHECKOUT_EMAILS', { customerEmail });
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
      }
    }

    // ← ここで初期化（ビルド時には実行されない）
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error('Missing STRIPE_SECRET_KEY at runtime');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const stripe = new Stripe(secret);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/purchase/success${slug ? `?slug=${encodeURIComponent(slug)}` : ''}${slug ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/purchase/cancel`,
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