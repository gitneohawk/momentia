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

// Admin判定（将来のEntra IDロール/グループ対応込み）
export function isAdminSession(session: any): boolean {
  const email: string | undefined = session?.user?.email ?? undefined;
  if (isAdminEmail(email)) return true;

  // Entra App Roles / Groups を環境変数で制御
  const requireRoles = (process.env.ADMIN_ENTRA_APP_ROLES || "").split(",").map(s => s.trim()).filter(Boolean);
  const requireGroups = (process.env.ADMIN_ENTRA_GROUP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const groups: string[] = Array.isArray(session?.user?.groups) ? session.user.groups : [];

  if (requireRoles.length && roles.some(r => requireRoles.includes(r))) return true;
  if (requireGroups.length && groups.some(g => requireGroups.includes(g))) return true;

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
    async jwt({ token, profile, account }) {
      if (profile && typeof (profile as any).email === "string") {
        token.email = (profile as any).email as string;
      }
      // Try to carry Azure Entra App Roles / Groups onto the token
      try {
        const asAny: any = { account, token, profile };
        let roles: string[] | undefined = asAny?.idToken?.roles || asAny?.token?.roles; // provider may map differently
        let groups: string[] | undefined = asAny?.idToken?.groups || asAny?.token?.groups;

        if (!roles || !groups) {
          const raw = asAny?.account?.id_token as string | undefined;
          if (raw && raw.includes(".")) {
            const payload = JSON.parse(Buffer.from(raw.split(".")[1], "base64").toString("utf8"));
            roles = roles || (Array.isArray(payload?.roles) ? payload.roles : undefined);
            groups = groups || (Array.isArray(payload?.groups) ? payload.groups : undefined);
          }
        }

        if (Array.isArray(roles)) (token as any).roles = roles;
        if (Array.isArray(groups)) (token as any).groups = groups;
      } catch {
        // noop: roles/groups not present
      }
      return token;
    },
    // Reflect email back onto the session (guard against undefineds)
    async session({ session, token }) {
      if (session?.user) {
        if (typeof token.email === "string") session.user.email = token.email;
        (session.user as any).roles = Array.isArray((token as any).roles) ? (token as any).roles : [];
        (session.user as any).groups = Array.isArray((token as any).groups) ? (token as any).groups : [];
      }
      return session;
    },
  },
};