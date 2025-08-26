/*
  Warnings:

  - Made the column `createdAt` on table `Wallet` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."Wallet_userId_key";

-- AlterTable
ALTER TABLE "public"."Wallet" ALTER COLUMN "createdAt" SET NOT NULL;
