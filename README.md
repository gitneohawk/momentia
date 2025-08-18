# Momentia

Momentia is a photo portfolio site built with Next.js, Azure Static Web Apps, and Azure Blob Storage. It uses PostgreSQL for metadata storage and Prisma as the ORM.

## Background

This project is intended to showcase and optionally sell photos, initially focusing on digital downloads. Future plans may include professional printing integration to expand the offerings.

## Tech Stack

- Next.js
- Prisma
- PostgreSQL (running via Docker)
- Azurite (Azure Blob Storage emulator)
- Sharp (for image processing)
- Exifr (for EXIF data extraction)
- Tailwind CSS
- yet-another-react-lightbox

## Local Development Setup

1. **Prerequisites**: Ensure you have Node.js, npm, Docker, and Docker Compose installed.
2. Clone the repository.
3. Run `docker compose up -d` to start PostgreSQL and Azurite services.  
   > Note: The default PostgreSQL port is set to `5433` in the `.env` file.
4. Install dependencies:  
   ```bash
   npm install
   ```
5. Run Prisma migrations:  
   ```bash
   npx prisma migrate dev --name init
   ```
6. Place some sample images in the `seed/photos` directory.
7. Run the seed script to process and upload images:  
   ```bash
   npx tsx scripts/seed.ts
   ```
8. Start the development server:  
   ```bash
   npm run dev
   ```
9. Open your browser and visit [http://localhost:3000](http://localhost:3000).

## Environment Variables

Set the following environment variables (e.g., in a `.env` file):

```
DATABASE_URL=postgres://app:app@localhost:5433/portfolio
AZURE_STORAGE_CONNECTION_STRING=UseAzCopyOrAzuriteDefault
```

## Development Notes

- The seed script resizes and uploads images to Azure Blob Storage, and stores metadata in PostgreSQL.
- Generated thumbnails and large images are stored under `public/`, while full-size JPEGs are stored in `originals/`.
- EXIF data extracted from photos is stored in the `Photo.exifRaw` field.

## How to Continue Development

- When starting new chat sessions with ChatGPT or other AI tools, share this README to provide context.
- Extend the data model by modifying the Prisma schema located at `prisma/schema.prisma`.
- Add new features by creating React components in `src/components` and pages under `src/pages`.

## Future Plans

- Add professional printing integration.
- Implement keyword auto-generation using the OpenAI API.
- Build an admin dashboard for managing uploads and tracking sales.

# Momentia — Photo Portfolio & Sales Platform

Momentia is a photo portfolio site built with **Next.js**, **Azure Static Web Apps**, and **Azure Blob Storage**. It uses **PostgreSQL** for metadata storage and **Prisma** as the ORM.  
The goal is to provide a visually stunning and technically robust platform to showcase and optionally sell photography works — starting with digital downloads and potentially expanding to professional printing.

---

## 1. Project Overview

**Name Origin:**  
The name *Momentia* combines *moment* (capturing the instant) with *-ia* (evoking place or state), representing a place where moments live forever.

**Purpose:**  
- Showcase personal and commissioned photography (e.g., landscapes, macro, event shots).
- Support selling digital downloads initially.
- Later expand to offer professional print orders.

**Key Differentiators:**  
- Clean, minimalist design for photo-first presentation.
- Azure ecosystem for cost-effective scalability.
- EXIF-driven metadata storage for powerful search/filter features.

---

## 2. Architecture

**System Diagram:**
```
[Next.js Frontend] --(Static Deployment)--> [Azure Static Web Apps]
       |                                     |
       | (API calls)                         |
       v                                     v
[Azure Functions API]  -->  [PostgreSQL via Docker/Azure Database]
                         -->  [Azure Blob Storage / Azurite]
```

**Tech Choices & Reasons:**
- **Next.js** → Hybrid SSG/SSR, image optimization, strong ecosystem.
- **PostgreSQL** → Strong relational capabilities, supports JSON fields for EXIF.
- **Prisma** → Type-safe ORM with schema migration support.
- **Azurite** → Local Azure Blob Storage emulator for dev/testing.
- **Tailwind CSS** → Utility-first styling, rapid iteration.
- **yet-another-react-lightbox** → Smooth fullscreen photo browsing.

---

## 3. Full Local Setup (First-Time)

**Prerequisites:**
- Node.js ≥ 20.x
- npm ≥ 11.x
- Docker & Docker Compose
- GitHub account (for package installs via git if needed)

**Steps:**
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/momentia.git
   cd momentia
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Docker services:
   ```bash
   docker compose up -d
   ```
   > Default PostgreSQL port is `5433`. Change via `.env` if needed.
4. Initialize database:
   ```bash
   npx prisma migrate dev --name init
   ```
5. Add seed images:
   - Place `.jpg` or `.png` files in `seed/photos/`
6. Seed database:
   ```bash
   npx tsx scripts/seed.ts
   ```
7. Start dev server:
   ```bash
   npm run dev
   ```
8. Visit: [http://localhost:3000](http://localhost:3000)

---

## 4. Environment Variables

Example `.env`:
```
DATABASE_URL=postgres://app:app@localhost:5433/portfolio
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
```

---

## 5. Directory Structure & Naming Rules

```
/prisma              → Prisma schema & migrations
/scripts             → Utility & seed scripts
/src/components      → Reusable UI components (PascalCase)
/src/pages           → Next.js pages & API routes
/public              → Static assets (non-uploaded)
/seed/photos         → Initial local seed images
```

**Rules:**
- Components: `PascalCase` (e.g., `PhotoCard.tsx`)
- API routes: lowercase with hyphens (e.g., `get-photos.ts`)
- Tailwind classes: group layout → spacing → color → typography

---

## 6. Development Guidelines

**Branching Model:**
- `main` → stable production-ready branch
- `feature/*` → feature-specific branches

**Code Style:**
- Use Prettier defaults.
- Avoid inline styles, prefer Tailwind utilities.

**Commit Messages:**
- Use [Conventional Commits](https://www.conventionalcommits.org/) format.

---

## 7. Deployment to Production

1. Push to `main`.
2. Azure Static Web Apps auto-build will trigger.
3. Apply DB migrations in production:
   ```bash
   npx prisma migrate deploy
   ```
4. Ensure `AZURE_STORAGE_CONNECTION_STRING` and `DATABASE_URL` are set in Azure environment settings.

---

## 8. Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| `Bind for 0.0.0.0:5432 failed` | Port already in use | Change `PG_PORT` in `.env` and restart Docker |
| `P1000: Authentication failed` | Wrong DB creds | Check `.env` matches docker-compose settings |
| `Azurite not starting` | Port conflict | Change Azurite port in `docker-compose.yml` |

---

## 9. Future Enhancements

- AI-generated keywords & tags via OpenAI API.
- Full-text search by title, caption, and keywords.
- Professional printing integration (Pixartprinting, Printful, etc.).
- Admin dashboard for uploads and sales tracking.
- Role-based authentication for contributors.

---

## 10. Continuing Development with AI Tools

When starting a **new chat** with ChatGPT, Claude, or GitHub Copilot Chat, paste this README and say:

> "Please read this file and then help me implement feature X."

This ensures context is preserved even in fresh sessions.

---