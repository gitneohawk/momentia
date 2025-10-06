// Centralized e-mail templates for Momentia
// Note: headers like from/reply-to are set by the sender (mailer.ts / API).
// These templates only return subject/text/html bodies.

const fmtJPY = (n: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);

const brandFooterText =
`---
Momentia（Evoluzio Inc.）
Web: https://momentia.evoluzio.com/
お問合せ: info@evoluzio.com
※このメールに返信すると運営宛て（info@evoluzio.com）に届きます。`;

const brandFooterHtml = `
<hr/>
<p style="margin:8px 0 0 0;font-size:12px;color:#666">
  Momentia（Evoluzio Inc.）<br/>
  Web: <a href="https://momentia.evoluzio.com/">https://momentia.evoluzio.com/</a><br/>
  お問合せ: <a href="mailto:info@evoluzio.com">info@evoluzio.com</a><br/>
  <span>※このメールに返信すると運営宛て（info@evoluzio.com）に届きます。</span>
</p>
`;

// Ensure the download URL is the canonical query form: /api/download?token=...
// Accepts full URL, path-based token (/api/download/<token>), raw token, or already-canonical query string.
function buildDownloadUrl(input: string): string {
  const BASE = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/+$/,"");
  const s = (input ?? "").trim();
  if (!s) return `${BASE}/api/download`; // fallback (unlikely)

  // Already absolute URL
  if (s.includes("://")) return s;

  // Already query style (path or query)
  if (s.startsWith("/api/download?")) return `${BASE}${s}`;

  // Path style: /api/download/<token>
  if (s.startsWith("/api/download/")) {
    const token = s.substring("/api/download/".length).split(/[?#]/)[0];
    if (token) return `${BASE}/api/download?token=${token}`;
  }

  // Raw 64-hex token
  if (/^[a-f0-9]{64}$/i.test(s)) {
    return `${BASE}/api/download?token=${s}`;
  }

  // Any other relative path
  if (s.startsWith("/")) return `${BASE}${s}`;

  // Fallback to query style
  return `${BASE}/api/download?token=${encodeURIComponent(s)}`;
}

// ————— Order: Digital to User —————
export function tplOrderDigitalUser(params: {
  title: string;
  slug: string;
  downloadUrl: string;
  price: number;
  orderId?: string;
}) {
  const { title, downloadUrl, price, orderId } = params; const url = buildDownloadUrl(downloadUrl);
  const subject = `【Momentia】デジタル画像のダウンロード方法${orderId ? `（注文番号: ${orderId}）` : ""}`;

  const text = `この度はご購入ありがとうございます。
商品: ${title}
注文番号: ${orderId ?? "-"}
金額: ${fmtJPY(price)}
ダウンロードURL: ${url}
※URLは一定期間で失効します。お早めに保存ください。
※本画像は個人・商用利用可（規約順守）。再配布・再販売・第三者への譲渡、商品化は不可です。
${brandFooterText}`;

  const html = `
  <p>この度はご購入ありがとうございます。</p>
  <p><b>商品:</b> ${title}<br/>
     <b>注文番号:</b> ${orderId ?? "-"}<br/>
     <b>金額:</b> ${fmtJPY(price)}</p>
  <p><a href="${url}">ダウンロードはこちら</a><br/>
  <small>※URLは一定期間で失効します。お早めに保存ください。</small></p>
  <p style="font-size:12px;color:#555">
    本画像は個人・商用利用可（規約順守）。再配布・再販売・第三者への譲渡、商品化（二次販売目的のグッズ等への使用）は不可です。<br/>
    詳細はサイトの利用規約をご確認ください。
  </p>
  ${brandFooterHtml}
  `;
  return { subject, text, html };
}

// ————— Order: Panel to User —————
export function tplOrderPanelUser(params: {
  title: string;
  price: number;
  eta: string;
  orderId?: string;
}) {
  const { title, price, eta, orderId } = params;
  const subject = `【Momentia】パネルご注文を受け付けました${orderId ? `（注文番号: ${orderId}）` : ""}`;

  const text = `この度はご注文ありがとうございます。
商品: ${title}
注文番号: ${orderId ?? "-"}
金額: ${fmtJPY(price)}
出荷目安: ${eta}
発送準備が整い次第、あらためてご連絡いたします。
${brandFooterText}`;

  const html = `
  <p>この度はご注文ありがとうございます。</p>
  <p><b>商品:</b> ${title}<br/>
     <b>注文番号:</b> ${orderId ?? "-"}<br/>
     <b>金額:</b> ${fmtJPY(price)}<br/>
     <b>出荷目安:</b> ${eta}</p>
  <p>発送準備が整い次第、あらためてご連絡いたします。</p>
  ${brandFooterHtml}
  `;
  return { subject, text, html };
}

// ————— Order: Admin Notice —————
export function tplOrderAdminNotice(params: {
  kind: "digital" | "panel";
  title: string;
  slug: string;
  email: string;
  amount: number;
  orderId?: string;
}) {
  const { kind, title, slug, email, amount, orderId } = params;
  const subject = `【注文通知】${title} / ${kind} / ${fmtJPY(amount)}${orderId ? ` / #${orderId}` : ""}`;

  const text = `新規注文
種別: ${kind}
商品: ${title} (${slug})
購入者: ${email}
金額: ${fmtJPY(amount)}
注文番号: ${orderId ?? "-"}
${brandFooterText}`;

  const html = `<p>新規注文がありました。</p>
  <ul>
    <li>種別: ${kind}</li>
    <li>商品: ${title} (${slug})</li>
    <li>購入者: <a href="mailto:${email}">${email}</a></li>
    <li>注文番号: ${orderId ?? "-"}</li>
    <li>金額: ${fmtJPY(amount)}</li>
  </ul>
  ${brandFooterHtml}`;
  return { subject, text, html };
}

// ————— Inquiry: Auto-reply to User —————
export function tplInquiryAutoReply(name?: string, replyEtaText: string = "通常は2営業日以内にご返信いたします。") {
  const subject = "【Momentia】お問い合わせを受け付けました";
  const text = `${name ?? "お客様"} 様
お問い合わせありがとうございます。担当より折り返しご連絡いたします。
${replyEtaText}
${brandFooterText}`;

  const html = `<p>${name ?? "お客様"} 様</p>
  <p>お問い合わせありがとうございます。担当より折り返しご連絡いたします。</p>
  <p>${replyEtaText}</p>
  ${brandFooterHtml}`;
  return { subject, text, html };
}

// ————— Inquiry: Admin Notice —————
export function tplInquiryAdminNotice(params: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  const { name, email, subject: sub, message } = params;
  const subject = `【お問い合わせ】${sub ?? "(件名なし)"} from ${name}`;

  const text = `from: ${name} <${email}>
---
${message}
${brandFooterText}`;

  const html = `<p>from: ${name} &lt;<a href="mailto:${email}">${email}</a>&gt;</p>
  <pre style="white-space:pre-wrap;font-family:inherit">${message}</pre>
  ${brandFooterHtml}`;
  return { subject, text, html };
}