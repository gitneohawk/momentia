-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "downloadToken" TEXT,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."Photo" ALTER COLUMN "priceDigitalJPY" SET DEFAULT 11000,
ALTER COLUMN "pricePrintA2JPY" SET DEFAULT 55000;
