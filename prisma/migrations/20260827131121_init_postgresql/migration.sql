-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionEnc" TEXT,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "acquiredDate" TIMESTAMP(3),
    "memoEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "noteEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "institutionEnc" TEXT,
    "principal" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "rateType" TEXT NOT NULL,
    "repaymentMethod" TEXT NOT NULL,
    "monthlyPayment" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "rateChangeDate" TIMESTAMP(3),
    "memoEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowEntry" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "memoEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvImportRecord" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "occurrenceIndex" INTEGER NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourceKey" TEXT,
    "cashflowEntryId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsvImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "totalAssets" DOUBLE PRECISION NOT NULL,
    "totalLoans" DOUBLE PRECISION NOT NULL,
    "netWorth" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "age" INTEGER,
    "region" TEXT,
    "householdAnnualIncomeManwon" INTEGER,
    "occupation" TEXT,
    "householdType" TEXT,
    "maritalStatus" TEXT,
    "numberOfChildren" INTEGER,
    "homeOwnership" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyProgram" (
    "id" TEXT NOT NULL,
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
    "verifiedDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "CashflowEntry_yearMonth_idx" ON "CashflowEntry"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CsvImportRecord_cashflowEntryId_key" ON "CsvImportRecord"("cashflowEntryId");

-- CreateIndex
CREATE INDEX "CsvImportRecord_sourceKey_rowFingerprint_idx" ON "CsvImportRecord"("sourceKey", "rowFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "CsvImportRecord_fileHash_rowFingerprint_occurrenceIndex_key" ON "CsvImportRecord"("fileHash", "rowFingerprint", "occurrenceIndex");

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_yearMonth_key" ON "NetWorthSnapshot"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyProgram_slug_key" ON "PolicyProgram"("slug");

-- AddForeignKey
ALTER TABLE "AssetHistory" ADD CONSTRAINT "AssetHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImportRecord" ADD CONSTRAINT "CsvImportRecord_cashflowEntryId_fkey" FOREIGN KEY ("cashflowEntryId") REFERENCES "CashflowEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

