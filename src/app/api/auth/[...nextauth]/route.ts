import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid any caching of auth endpoints

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };