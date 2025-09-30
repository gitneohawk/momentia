import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminLogoutButton from "@/components/AdminLogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  // 未ログイン: サインインへ
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/admin");
  }

  // 権限チェック: evoluzio.com ドメインのユーザーのみ許可
  const email = session.user?.email ?? "";
  const isAdmin = email.endsWith("@evoluzio.com");
  if (!isAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-end p-4 border-b">
        <AdminLogoutButton />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}