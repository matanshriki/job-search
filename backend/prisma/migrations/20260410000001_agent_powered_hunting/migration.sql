-- AlterTable: add pipeline/queue settings to app_settings
ALTER TABLE "app_settings" ADD COLUMN "autoPipelineEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_settings" ADD COLUMN "autoQueueThreshold" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "app_settings" ADD COLUMN "autoPipelineActionsJson" TEXT NOT NULL DEFAULT '["fit_analysis","resume_tailoring","outreach"]';

-- CreateTable: job_board_sources
CREATE TABLE "job_board_sources" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "boardType" TEXT NOT NULL,
    "searchConfigJson" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastJobsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_board_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: approval_queue_items
CREATE TABLE "approval_queue_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobPostingId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL DEFAULT 'send_outreach',
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_queue_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "job_board_sources" ADD CONSTRAINT "job_board_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_queue_items" ADD CONSTRAINT "approval_queue_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_queue_items" ADD CONSTRAINT "approval_queue_items_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
