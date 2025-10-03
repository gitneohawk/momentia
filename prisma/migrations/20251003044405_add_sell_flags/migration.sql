-- AlterTable
ALTER TABLE "public"."Photo" ADD COLUMN     "sellDigital" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellPanel" BOOLEAN NOT NULL DEFAULT true;
