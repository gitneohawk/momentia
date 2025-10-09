// src/lib/auth.ts
import { type NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

// Entra ID (Azure AD) ONLY configuration.
// Required env vars:
//  - AZURE_AD_CLIENT_ID
//  - AZURE_AD_CLIENT_SECRET
//  - AZURE_AD_TENANT_ID

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map(e => e.trim().toLowerCase()) : [];
  const domain = process.env.ADMIN_EMAIL_DOMAIN ?? "evoluzio.com";
  const normalizedEmail = email.toLowerCase();
  if (allowlist.includes(normalizedEmail)) return true;
  if (normalizedEmail.endsWith(`@${domain}`)) return true;
  return false;
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      // If you need specific scopes, uncomment below
      // authorization: { params: { scope: "openid profile email" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Attach email to the JWT (kept minimal for admin-gate usage)
    // Entra app-roles could be attached here later
    async jwt({ token, profile }) {
      if (profile && typeof (profile as any).email === "string") {
        token.email = (profile as any).email as string;
      }
      return token;
    },
    // Reflect email back onto the session (guard against undefineds)
    async session({ session, token }) {
      if (session?.user) {
        if (typeof token.email === "string") session.user.email = token.email;
      }
      return session;
    },
  },
};