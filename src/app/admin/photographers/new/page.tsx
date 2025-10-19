import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function createPhotographer(formData: FormData) {
  "use server";

  const rawSlug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!rawSlug || !name) {
    throw new Error("slug と name は必須です。");
  }

  const slug = normalizeSlug(rawSlug);
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const profileUrl = String(formData.get("profileUrl") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;

  const existing = await prisma.photographer.findUnique({ where: { slug } });
  if (existing) {
    throw new Error("同じ slug のフォトグラファーが既に存在します。");
  }

  await prisma.photographer.create({
    data: { slug, name, displayName, bio, profileUrl, website, contactEmail },
  });

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export const metadata = { title: "Admin / Photographers / New" };

export default function NewPhotographerPage() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Photographer 新規作成</h1>
        <p className="mt-1 text-sm text-neutral-600">
          slug（URL用）と name は必須です。他の項目は必要に応じて入力してください。
        </p>
      </header>

      <form action={createPhotographer} className="grid gap-5">
        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="slug">
            slug<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            placeholder="例: hawk"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="name">
            name<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            placeholder="表示名"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="displayName">
            displayName
          </label>
          <input
            id="displayName"
            name="displayName"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            placeholder="任意の別名"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="bio">
            bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={5}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            placeholder="プロフィール紹介文"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="profileUrl">
              profileUrl
            </label>
            <input
              id="profileUrl"
              name="profileUrl"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="プロフィール画像のURL"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="website">
              website
            </label>
            <input
              id="website"
              name="website"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="公式サイト"
            />
          </div>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="contactEmail">
            contactEmail
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            placeholder="連絡先メールアドレス"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            作成
          </button>
        </div>
      </form>
    </section>
  );
}
