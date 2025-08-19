import NextAuth, { type AuthOptions, type Session } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import type { JWT } from "next-auth/jwt";

const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!, // 単一テナントならそのID、共通なら "common"
    }),
  ],
  session: { strategy: "jwt" as const },
  callbacks: {
    async session({ session, token: _token }: { session: Session; token: JWT }) {
      // ここで session.user.email などを整形してもOK
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };