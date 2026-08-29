-- CreateEnum
CREATE TYPE "LoginRateLimitBucketType" AS ENUM ('USERNAME', 'IP');

-- CreateTable
CREATE TABLE "LoginRateLimitBucket" (
    "id" TEXT NOT NULL,
    "bucketType" "LoginRateLimitBucketType" NOT NULL,
    "keyHash" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginRateLimitBucket_bucketType_keyHash_key" ON "LoginRateLimitBucket"("bucketType", "keyHash");
