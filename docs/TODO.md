


# Blog Mini-CMS Implementation Plan

## High Priority Tasks
1. Configure custom domain (momentia.evoluzio.com) on Azure Container Apps and DNS.
2. Set up a separate Azure Blob container for Blog images (distinct from Gallery).
3. Implement purchase flow from Gallery → Purchase → Stripe Checkout.

## Goal
Implement a lightweight CMS for blog posts so that articles can be added/edited without committing to GitHub for each update.

## Tasks
1. **Database Setup**
   - Add `Post` model to Prisma schema with fields:
     - id (string, cuid)
     - title (string)
     - slug (string, unique)
     - description (string, optional)
     - content (Markdown/MDX string)
     - hero (string, optional - image path)
     - tags (string array, optional)
     - date (DateTime)
     - published (boolean, default: false)
     - createdAt / updatedAt (DateTime)
   - Run `prisma migrate dev` to update database.

2. **API Endpoints**
   - `GET /api/blog` → list posts (with pagination, filter by published)
   - `GET /api/blog/[slug]` → fetch single post
   - `POST /api/blog` → create post (admin only)
   - `PUT /api/blog/[id]` → update post (admin only)
   - `DELETE /api/blog/[id]` → delete post (admin only)

3. **Admin UI (/admin/blog)**
   - Blog list with "Create New" button
   - Form for editing title, slug, description, hero image URL, tags, content
   - Preview mode for MDX
   - Authentication/authorization (only admins)

4. **Frontend Integration**
   - Blog page fetches from API instead of reading local `.mdx` files
   - Handle `published` flag to only show public posts

5. **Deployment Considerations**
   - Ensure environment variables (DB URL, admin auth secrets) are set in Azure
   - Use Azure Managed PostgreSQL or similar for DB
   - Migrate existing `.mdx` posts into the database

6. **Security & Access Control**
   - Blob storage must be private (no anonymous access)
   - Use SAS tokens or API streaming to serve images
   - Admin endpoints must require authentication
   - Apply rate limiting and size limits to uploads and API routes

## Notes
- Initial version can be text + images only; advanced MDX components can be added later.
- Keep styling consistent with current `prose` typography setup.
- Stripe Checkout will be used for initial payment integration; PayPal may be added later, Amazon Pay considered in future.

## Mobile UX & Perf

- [ ] Landing: Featured Works（モバイル）
  - [ ] A案: スマホでは非表示（`hidden md:block`）
  - [ ] B案: 2列グリッド（最大4枚）＋「もっと見る」→ /gallery
  - [ ] サムネ `sizes="(max-width: 640px) 50vw, 33vw"`

- [ ] Lightbox: ウォーターマーク事前生成
  - [ ] Upload時に `photos/wm/<slug>_wm_2048.jpg` を生成（sharpで合成）
  - [ ] `/api/wm/[slug]` は存在チェック→あれば302、無ければ生成→保存→302
  - [ ] Blob に `Cache-Control: public, max-age=31536000, immutable`
  - [ ] ファイル名に `wm` のバージョンを含める（例 `_wm-v2_`）

- [ ] Landing: Hero 画像最適化
  - [ ] 出力幅: 640/960/1280/1600/1920 を生成（AVIF/WebP優先）
  - [ ] `<Image priority sizes="(max-width:640px) 100vw, (max-width:1024px) 90vw, 1200px">`
  - [ ] blurDataURL プレースホルダを設定
  - [ ] 目標: LCP画像 < 200KB

- [ ] Gallery 体験
  - [ ] 初期ロードを12枚に制限、以降“もっと見る”で追加ロード
  - [ ] `rowConstraints.minPhotos: 1`（少枚数でも崩れない）
  - [ ] サムネは 480px（DPR2向けに960pxまで許容）

- [ ] 本番キャッシュ/TTL
  - [ ] public画像: CDN長期キャッシュ
  - [ ] `/api/photos`: `s-maxage=60, stale-while-revalidate=600`
  - [ ] SAS TTL: thumb/large=30–60分、wm=24h