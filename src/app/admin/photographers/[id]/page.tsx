import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function updatePhotographer(id: string, formData: FormData) {
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

  const existing = await prisma.photographer.findFirst({
    where: { slug, NOT: { id } },
    select: { id: true },
  });
  if (existing) {
    throw new Error("同じ slug のフォトグラファーが既に存在します。");
  }

  await prisma.photographer.update({
    where: { id },
    data: { slug, name, displayName, bio, profileUrl, website, contactEmail },
  });

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

async function deletePhotographer(id: string) {
  "use server";
  await prisma.photographer.delete({ where: { id } });
  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export const metadata = { title: "Admin / Photographers / Edit" };

export default async function EditPhotographerPage({ params }: Props) {
  const { id } = await params;
  const photographer = await prisma.photographer.findUnique({ where: { id } });
  if (!photographer) return notFound();

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Photographer 編集</h1>
          <p className="mt-1 text-sm text-neutral-600">
            slug と name は必須です。変更後は一覧へ自動的に戻ります。
          </p>
        </div>
      </header>

      <form action={updatePhotographer.bind(null, photographer.id)} className="grid gap-5">
        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="slug">
            slug<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            defaultValue={photographer.slug}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="name">
            name<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            defaultValue={photographer.name}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-neutral-700" htmlFor="displayName">
            displayName
          </label>
          <input
            id="displayName"
            name="displayName"
            defaultValue={photographer.displayName ?? ""}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
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
            defaultValue={photographer.bio ?? ""}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
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
              defaultValue={photographer.profileUrl ?? ""}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="website">
              website
            </label>
            <input
              id="website"
              name="website"
              defaultValue={photographer.website ?? ""}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
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
            defaultValue={photographer.contactEmail ?? ""}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            保存
          </button>
        </div>
      </form>

      <form action={deletePhotographer.bind(null, photographer.id)} className="flex justify-start">
        <button
          type="submit"
          className="rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          削除
        </button>
      </form>
    </section>
  );
}
