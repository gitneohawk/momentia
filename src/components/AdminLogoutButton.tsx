

"use client";

import { signOut } from "next-auth/react";

export default function AdminLogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md border border-neutral-900 px-4 py-2 text-sm hover:bg-neutral-100"
    >
      ログアウト
    </button>
  );
}