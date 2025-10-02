// lib/mailer.ts
import { EmailClient } from "@azure/communication-email";

const client = new EmailClient(process.env.ACS_CONNECTION_STRING!);
const FROM = process.env.MAIL_FROM!; // "no-reply@yourdomain.com"

export async function sendMail({ to, subject, html }: {to: string; subject: string; html: string;}) {
  await client.beginSend({
    senderAddress: FROM,
    content: { subject, html },
    recipients: { to: [{ address: to }] }
  });
  return true;
}