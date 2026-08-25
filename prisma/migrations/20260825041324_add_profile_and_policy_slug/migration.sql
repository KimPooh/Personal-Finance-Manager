/*
  Warnings:

  - Added the required column `slug` to the `PolicyProgram` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "age" INTEGER,
    "region" TEXT,
    "householdAnnualIncomeManwon" INTEGER,
    "occupation" TEXT,
    "householdType" TEXT,
    "maritalStatus" TEXT,
    "numberOfChildren" INTEGER,
    "homeOwnership" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PolicyProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "targetCriteriaJson" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "applicationPeriod" TEXT NOT NULL,
    "requiredDocuments" TEXT NOT NULL,
    "officialUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "verifiedDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PolicyProgram" ("agency", "applicationPeriod", "benefit", "createdAt", "id", "officialUrl", "requiredDocuments", "sourceName", "status", "summary", "targetCriteriaJson", "title", "updatedAt", "verifiedDate") SELECT "agency", "applicationPeriod", "benefit", "createdAt", "id", "officialUrl", "requiredDocuments", "sourceName", "status", "summary", "targetCriteriaJson", "title", "updatedAt", "verifiedDate" FROM "PolicyProgram";
DROP TABLE "PolicyProgram";
ALTER TABLE "new_PolicyProgram" RENAME TO "PolicyProgram";
CREATE UNIQUE INDEX "PolicyProgram_slug_key" ON "PolicyProgram"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
