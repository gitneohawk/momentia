// src/lib/auth.ts
import { type NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

// Entra ID (Azure AD) ONLY configuration.
// Required env vars:
//  - AZURE_AD_CLIENT_ID
//  - AZURE_AD_CLIENT_SECRET
//  - AZURE_AD_TENANT_ID

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