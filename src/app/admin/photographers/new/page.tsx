import PhotographerImageUploader from "@/components/PhotographerImageUploader";
import { createPhotographerAction } from "../actions";

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

      <form action={createPhotographerAction} className="grid gap-5">
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
            <p className="text-xs text-neutral-500">
              Blob キー（例: <code>profiles/example.jpg</code>）またはフル URL を入力できます。
            </p>
            <PhotographerImageUploader />
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
