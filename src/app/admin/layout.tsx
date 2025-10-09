export const metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    other: [
      { rel: "mask-icon", url: "/logo_symbol.svg", color: "#1E3350" }
    ],
  },
};

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminLogoutButton from "@/components/AdminLogoutButton";
import { authOptions, isAdminEmail } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // 未ログイン: サインインへ
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/admin");
  }

  // 権限チェック: 管理者メールかどうか（RBAC移行までの暫定）
  const email = session.user?.email ?? "";
  const isAdmin = isAdminEmail(email);
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