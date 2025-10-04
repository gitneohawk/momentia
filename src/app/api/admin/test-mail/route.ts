import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { sendMail } from "@/lib/mailer";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const searchParams = req.nextUrl.searchParams;
  const to = searchParams.get("to") || session.user.email;
  const subject = searchParams.get("subject") || "Test Email";
  await sendMail({
    to,
    subject,
    html: `<p>This is a test email from <strong>Momentia</strong> via ACS.</p>`
  });
  return NextResponse.json({ success: true, to, subject });
}