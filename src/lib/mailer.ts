// lib/mailer.ts
import { EmailClient } from "@azure/communication-email";
import { logger, serializeError } from "./logger";

let cachedClient: EmailClient | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function extractStatus(err: any): number | null {
  if (typeof err?.statusCode === "number") return err.statusCode;
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.response?.status === "number") return err.response.status;
  return null;
}

function isRetryable(err: any): boolean {
  const status = extractStatus(err);
  if (status == null) return false;
  if (status >= 500) return true;
  return status === 429;
}

const log = logger.child({ module: "lib/mailer" });

const maskEmail = (value: string) => {
  const [user, domain] = value.split("@");
  if (!user || !domain) return value;
  return `${user.slice(0, 1)}***@${domain}`;
};

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
  const maxAttempts = parsePositiveInt(process.env.MAIL_RETRY_ATTEMPTS, 3);
  const baseDelayMs = parsePositiveInt(process.env.MAIL_RETRY_BASE_DELAY_MS, 500);

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
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

      log.info("Mail sent", {
        provider: "acs",
        to: maskEmail(to),
        from: maskEmail(from),
        replyTo: maskEmail(replyToAddr),
        subjectPreview: subject.slice(0, 80),
        status,
        messageId,
        durationMs,
        attempt,
      });

      if ((result as any)?.error) {
        throw new Error((result as any).error.message ?? "Email send failed");
      }

      return result;
    } catch (err: any) {
      lastError = err;
      const durationMs = Date.now() - startedAt;
      const retryable = isRetryable(err) && attempt < maxAttempts;

      log.error("Mail send failed", {
        provider: "acs",
        to: maskEmail(to),
        from: maskEmail(from),
        replyTo: maskEmail(replyToAddr),
        subjectPreview: subject.slice(0, 80),
        durationMs,
        attempt,
        retryable,
        err: serializeError(err),
      });

      if (!retryable) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function sendAdminMail(args: { subject: string; html: string; text?: string; replyTo?: string }) {
  const to = process.env.ADMIN_NOTICE_TO || "info@evoluzio.com";
  return sendMail({ to, ...args });
}
