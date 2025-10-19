-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "photographerId" TEXT;

-- CreateTable
CREATE TABLE "Photographer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "profileUrl" TEXT,
    "website" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photographer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Photographer_slug_key" ON "Photographer"("slug");

-- CreateIndex
CREATE INDEX "Photographer_name_idx" ON "Photographer"("name");

-- CreateIndex
CREATE INDEX "Photo_photographerId_idx" ON "Photo"("photographerId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "Photographer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
