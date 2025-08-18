

# Blog Mini-CMS Implementation Plan

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

## Notes
- Initial version can be text + images only; advanced MDX components can be added later.
- Keep styling consistent with current `prose` typography setup.