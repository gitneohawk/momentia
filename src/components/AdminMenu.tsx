// Server Component
import Link from "next/link";
import { getServerSession } from "next-auth";

export default async function AdminMenu() {
  const session = await getServerSession();
  if (!session) return null; // ← ログインしてなければ何も出さない

  return (
    <nav className="flex items-center gap-3">
      <Link href="/admin/manage" className="text-sm hover:underline">Admin</Link>
      <Link href="/admin/upload" className="text-sm hover:underline">Upload</Link>
      <Link href="/admin/blog" className="text-sm hover:underline">Blog Admin</Link>
    </nav>
  );
}