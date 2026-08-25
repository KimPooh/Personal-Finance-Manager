-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearMonth" TEXT NOT NULL,
    "totalAssets" REAL NOT NULL,
    "totalLoans" REAL NOT NULL,
    "netWorth" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_yearMonth_key" ON "NetWorthSnapshot"("yearMonth");
