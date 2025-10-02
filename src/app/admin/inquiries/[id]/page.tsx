import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

function fmt(dt: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(dt);
}

export default async function InquiryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  const isAdmin = email.endsWith("@evoluzio.com");
  if (!isAdmin) redirect("/");

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
  });

  if (!inquiry) notFound();

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">お問い合わせ詳細</h1>
        <Link href="/admin/inquiries" className="text-sm underline underline-offset-4">
          ← 一覧へ戻る
        </Link>
      </div>

      <div className="rounded-lg border p-5 space-y-4 bg-white">
        <div className="text-sm text-neutral-500">ID</div>
        <div className="font-mono break-all">{inquiry.id}</div>

        <div className="text-sm text-neutral-500">日時</div>
        <div>{fmt(inquiry.createdAt)}</div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-neutral-500">名前</div>
            <div>{inquiry.name}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">メール</div>
            <div>
              <a className="text-blue-600 underline" href={`mailto:${inquiry.email}`}>
                {inquiry.email}
              </a>
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm text-neutral-500">件名</div>
          <div className="font-semibold">{inquiry.subject}</div>
        </div>

        <div>
          <div className="text-sm text-neutral-500">本文</div>
          <pre className="whitespace-pre-wrap break-words bg-neutral-50 p-4 rounded-md">
            {inquiry.message}
          </pre>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">ステータス</span>
          <StatusBadge status={inquiry.status} />
          {/* ステータス更新 */}
          <form action={`/api/admin/inquiries`} method="post">
            <input type="hidden" name="id" value={inquiry.id} />
            <select
              name="status"
              defaultValue={inquiry.status}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="NEW">NEW</option>
              <option value="READ">READ</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <button
              className="ml-2 rounded border px-3 py-1 text-sm hover:bg-neutral-100"
              formAction="/api/admin/inquiries"
            >
              更新
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c =
    status === "NEW"
      ? "bg-amber-100 text-amber-700"
      : status === "READ"
      ? "bg-sky-100 text-sky-700"
      : "bg-neutral-200 text-neutral-700";
  return (
    <span className={`text-xs px-2 py-1 rounded ${c}`}>{status}</span>
  );
}