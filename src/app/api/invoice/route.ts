// src/app/api/invoice/route.ts
// Invoice delivery by token (HTML; can be swapped to PDF later)
// Accepts: GET /api/invoice?token=...
// Uses AccessToken(kind='invoice') with maxUses/expiry/revoked checks.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// ---- Company info (static) ----
const COMPANY = {
  name: "株式会社エヴォルツィオ",
  addr1: "東京都渋谷区恵比寿4-20-3",
  addr2: "恵比寿ガーデンプレイスタワー 18階",
  invNo: "T2-0110-0107-3296",
};

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status });
}

function renderHtml(params: { orderId: string; issuedAt: Date }) {
  const { orderId, issuedAt } = params;
  const issued = issuedAt.toISOString().slice(0, 10);
  const paymentMethod = "クレジットカード（Stripe 決済）"; // TODO: 決済種別に応じて将来可変に

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>領収書 / Receipt - Momentia</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","Yu Gothic",Meiryo,sans-serif;margin:24px;color:#111}
  .box{max-width:720px;margin:0 auto;border:1px solid #ddd;padding:24px;border-radius:8px;position:relative}
  h1{font-size:20px;margin:0 0 8px 0}
  .muted{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:8px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
  .seal{position:absolute;right:24px;top:24px;width:120px;height:auto;opacity:.95}
</style>
</head>
<body>
  <div class="box">
    <img src="/EvoluzioStamp.png" alt="会社印" class="seal" />
    <h1>領収書 / Receipt</h1>
    <div class="muted">発行日: ${issued}</div>
    <div class="muted">領収書番号: ${orderId}</div>

    <table>
      <tr><th>注文番号</th><td>${orderId}</td></tr>
      <tr><th>但し書き</th><td>写真作品代として</td></tr>
      <tr><th>お支払方法</th><td>${paymentMethod}</td></tr>
      <tr><th>備考</th><td>この領収書は電子的に発行されています。</td></tr>
    </table>

    <h2 style="margin-top:24px;font-size:16px">事業者情報</h2>
    <table>
      <tr><th>名称</th><td>${COMPANY.name}</td></tr>
      <tr><th>所在地</th><td>${COMPANY.addr1}<br/>${COMPANY.addr2}</td></tr>
      <tr><th>適格請求書発行事業者登録番号</th><td>${COMPANY.invNo}</td></tr>
    </table>

    <p class="muted" style="margin-top:16px">※ 金額・品目等の詳細は注文確認メールをご確認ください。</p>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return bad(400, "token が必要です。");

  // 1) 取得（注文メタは必要最小限）
  const t = await prisma.accessToken.findFirst({
    where: { id: token, kind: "invoice" },
    select: {
      id: true,
      used: true,
      maxUses: true,
      expiresAt: true,
      revoked: true,
      order: { select: { id: true } },
    },
  });

  if (!t || !t.order) return bad(404, "無効または期限切れのトークンです。");
  if (t.revoked) return bad(410, "このトークンは無効化されています。");
  if (t.expiresAt && t.expiresAt < new Date()) return bad(410, "このトークンは期限切れです。");
  if (t.used >= t.maxUses) return bad(429, "ダウンロード回数の上限に達しました。");

  // 2) 競合に強い加算（条件付き updateMany）
  const updated = await prisma.accessToken.updateMany({
    where: {
      id: token,
      kind: "invoice",
      revoked: false,
      // 未使用余地 & 未失効を二重チェック
      used: { lt: t.maxUses },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    data: { used: { increment: 1 } },
  });

  if (updated.count === 0) {
    return bad(409, "他の要求により同時に消費されました。もう一度お試しください。");
  }

  // 3) いまは HTML を返す（将来 PDF に置換可）
  const html = renderHtml({ orderId: t.order.id, issuedAt: new Date() });
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}