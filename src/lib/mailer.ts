// lib/mailer.ts
import { EmailClient } from "@azure/communication-email";

let cachedClient: EmailClient | null = null;

function getClient(): EmailClient {
  if (cachedClient) return cachedClient;
  const conn =
    process.env.ACS_CONNECTION_STRING ||
    process.env.COMMUNICATION_SERVICES_CONNECTION_STRING; // fallback
  if (!conn) {
    throw new Error(
      "ACS_CONNECTION_STRING (or COMMUNICATION_SERVICES_CONNECTION_STRING) is not set."
    );
  }
  cachedClient = new EmailClient(conn);
  return cachedClient;
}

type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Optional Reply-To. If omitted, MAIL_REPLY_TO or `info@evoluzio.com` is used.
   */
  replyTo?: string;
};

/**
 * Send an email via Azure Communication Services.
 * - From is fixed (MAIL_FROM or noreply@evoluzio.com)
 * - Reply-To defaults to MAIL_REPLY_TO or info@evoluzio.com
 * - Emits structured logs on success/failure
 */
export async function sendMail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendMailArgs) {
  const from = process.env.MAIL_FROM || "noreply@evoluzio.com";
  const replyToAddr = replyTo || process.env.MAIL_REPLY_TO || "info@evoluzio.com";

  const client = getClient();
  const startedAt = Date.now();

  try {
    const poller = await client.beginSend({
      senderAddress: from,
      content: text ? { subject, html, plainText: text } : { subject, html },
      recipients: { to: [{ address: to }] },
      replyTo: [{ address: replyToAddr }],
    });

    const result = await poller.pollUntilDone();
    const durationMs = Date.now() - startedAt;

    // Best-effort extraction
    const messageId = (result as any)?.id ?? (result as any)?.messageId ?? null;
    const status = (result as any)?.status ?? "Unknown";

    console.info(
      JSON.stringify({
        level: "info",
        type: "mail.send",
        provider: "acs",
        to,
        from,
        replyTo: replyToAddr,
        subject,
        status,
        messageId,
        durationMs,
      })
    );

    if ((result as any)?.error) {
      throw new Error((result as any).error.message ?? "Email send failed");
    }

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(
      JSON.stringify({
        level: "error",
        type: "mail.send.failed",
        provider: "acs",
        to,
        from,
        replyTo: replyToAddr,
        subject,
        durationMs,
        error: err?.message || String(err),
      })
    );
    throw err;
  }
}

export async function sendAdminMail(args: { subject: string; html: string; text?: string; replyTo?: string }) {
  const to = process.env.ADMIN_NOTICE_TO || "info@evoluzio.com";
  return sendMail({ to, ...args });
}