// lib/mailer.ts
import { EmailClient } from "@azure/communication-email";

const client = new EmailClient(process.env.ACS_CONNECTION_STRING!);
const FROM = process.env.MAIL_FROM!; // "no-reply@yourdomain.com"

export async function sendMail({ to, subject, html }: {to: string; subject: string; html: string;}) {
  const res = await client.beginSend({
    senderAddress: FROM,
    content: { subject, html },
    recipients: { to: [{ address: to }] }
  });
  // resはpoller。必要ならres.pollUntilDone()で確定状態を待つ or messageIdをDB保存して後で確認。
  return true;
}