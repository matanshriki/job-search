-- Job postings: direct tenant ownership (previously only via company).
-- Notifications: direct tenant ownership for queries and FK integrity.

-- 1) job_postings.userId — nullable first, backfill, then tighten
ALTER TABLE "job_postings" ADD COLUMN "userId" INTEGER;

UPDATE "job_postings" AS jp
SET "userId" = tc."userId"
FROM "target_companies" AS tc
WHERE jp."companyId" = tc."id";

-- 2) notifications.userId — backfill while all jobs still exist
ALTER TABLE "notifications" ADD COLUMN "userId" INTEGER;

UPDATE "notifications" AS n
SET "userId" = jp."userId"
FROM "job_postings" AS jp
WHERE n."jobPostingId" = jp."id";

DELETE FROM "notifications" WHERE "userId" IS NULL;

-- 3) Remove job rows that have no tenant (no company link)
DELETE FROM "job_postings" WHERE "userId" IS NULL;

ALTER TABLE "job_postings" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "job_postings_userId_idx" ON "job_postings"("userId");

ALTER TABLE "notifications" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
