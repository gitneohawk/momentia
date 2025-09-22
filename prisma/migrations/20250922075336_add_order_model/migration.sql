-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('paid', 'processing', 'shipped', 'canceled');

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "itemType" TEXT NOT NULL,
    "name" TEXT,
    "slug" TEXT,
    "email" TEXT,
    "amountJpy" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'jpy',
    "shipping" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'paid',

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_sessionId_key" ON "public"."Order"("sessionId");

-- CreateIndex
CREATE INDEX "Order_slug_idx" ON "public"."Order"("slug");

-- CreateIndex
CREATE INDEX "Order_email_idx" ON "public"."Order"("email");
