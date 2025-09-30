// Server Component
import Link from "next/link";
import { getServerSession } from "next-auth";

export default async function AdminMenu() {
  const session = await getServerSession();
  if (!session) return null;

  // 管理者チェック: evoluzio.com ドメインのユーザーだけ
  const email = session.user?.email ?? "";
  const isAdmin = email.endsWith("@evoluzio.com");
  if (!isAdmin) return null;

  return (
    <nav className="flex items-center gap-3">
      <Link href="/admin" className="text-sm hover:underline">Admin</Link>
    </nav>
  );
}