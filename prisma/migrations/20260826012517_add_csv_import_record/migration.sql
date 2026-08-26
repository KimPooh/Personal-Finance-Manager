-- CreateTable
CREATE TABLE "CsvImportRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileHash" TEXT NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "occurrenceIndex" INTEGER NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourceKey" TEXT,
    "cashflowEntryId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsvImportRecord_cashflowEntryId_fkey" FOREIGN KEY ("cashflowEntryId") REFERENCES "CashflowEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CsvImportRecord_cashflowEntryId_key" ON "CsvImportRecord"("cashflowEntryId");

-- CreateIndex
CREATE INDEX "CsvImportRecord_sourceKey_rowFingerprint_idx" ON "CsvImportRecord"("sourceKey", "rowFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "CsvImportRecord_fileHash_rowFingerprint_occurrenceIndex_key" ON "CsvImportRecord"("fileHash", "rowFingerprint", "occurrenceIndex");
