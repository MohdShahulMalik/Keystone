-- CreateTable
CREATE TABLE "JobStatusChange" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "toStatus" "JobListingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStatusChange_listingId_createdAt_idx" ON "JobStatusChange"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStatusChange_createdAt_idx" ON "JobStatusChange"("createdAt");

-- AddForeignKey
ALTER TABLE "JobStatusChange" ADD CONSTRAINT "JobStatusChange_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
