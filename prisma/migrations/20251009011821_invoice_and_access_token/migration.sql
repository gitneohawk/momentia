-- CreateEnum
CREATE TYPE "AccessTokenKind" AS ENUM ('digital', 'invoice', 'credit_note');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "invoiceRevoked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "personName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "refundNoteIssuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "AccessTokenKind" NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "used" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessToken_orderId_idx" ON "AccessToken"("orderId");

-- CreateIndex
CREATE INDEX "AccessToken_kind_idx" ON "AccessToken"("kind");

-- CreateIndex
CREATE INDEX "AccessToken_expiresAt_idx" ON "AccessToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
