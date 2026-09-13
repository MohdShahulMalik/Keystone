-- CreateEnum
CREATE TYPE "JobListingStatus" AS ENUM ('OPEN', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SearchMode" AS ENUM ('job', 'dsa');

-- CreateEnum
CREATE TYPE "SearchSessionStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SubagentStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('text', 'thinking', 'tool');

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT NOT NULL,
    "salary" TEXT,
    "experience" TEXT NOT NULL,
    "visa" TEXT,
    "type" TEXT NOT NULL,
    "country" TEXT,
    "status" "JobListingStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "preferences" JSONB,
    "title" TEXT,
    "mode" "SearchMode" NOT NULL DEFAULT 'job',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SearchSessionStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "openCodeSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubagentSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "SubagentStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "parentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subagentType" TEXT,
    "toolCount" INTEGER,
    "openCodeParentToolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "timeTaken" TEXT,

    CONSTRAINT "SubagentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSegment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "SegmentKind" NOT NULL,
    "text" TEXT NOT NULL,
    "toolId" TEXT,
    "timeTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubagentSegment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "SegmentKind" NOT NULL,
    "text" TEXT NOT NULL,
    "toolId" TEXT,
    "timeTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubagentSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jobListingJson" JSONB NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "jobId" TEXT,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchSession_openCodeSessionId_key" ON "SearchSession"("openCodeSessionId");

-- CreateIndex
CREATE INDEX "SearchSession_userId_createdAt_idx" ON "SearchSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchSession_openCodeSessionId_idx" ON "SearchSession"("openCodeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubagentSession_sessionId_key" ON "SubagentSession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubagentSession_openCodeParentToolId_key" ON "SubagentSession"("openCodeParentToolId");

-- CreateIndex
CREATE INDEX "SubagentSession_parentId_idx" ON "SubagentSession"("parentId");

-- CreateIndex
CREATE INDEX "SubagentSession_sessionId_idx" ON "SubagentSession"("sessionId");

-- CreateIndex
CREATE INDEX "ResearchSegment_sessionId_seq_idx" ON "ResearchSegment"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSegment_sessionId_seq_key" ON "ResearchSegment"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "SubagentSegment_sessionId_seq_idx" ON "SubagentSegment"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "SubagentSegment_sessionId_seq_key" ON "SubagentSegment"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_userId_key" ON "Resume"("userId");

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchSession" ADD CONSTRAINT "SearchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentSession" ADD CONSTRAINT "SubagentSession_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSegment" ADD CONSTRAINT "ResearchSegment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentSegment" ADD CONSTRAINT "SubagentSegment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SubagentSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SearchSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
