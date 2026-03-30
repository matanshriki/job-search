-- CreateTable
CREATE TABLE "profile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT NOT NULL DEFAULT '',
    "currentLocation" TEXT NOT NULL DEFAULT '',
    "preferredLocationsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredTitlesJson" TEXT NOT NULL DEFAULT '[]',
    "excludedTitlesJson" TEXT NOT NULL DEFAULT '[]',
    "targetKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "excludedKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "seniorityLevel" TEXT NOT NULL DEFAULT '[]',
    "remotePreference" TEXT NOT NULL DEFAULT 'flexible',
    "preferredFunctionsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredIndustriesJson" TEXT NOT NULL DEFAULT '[]',
    "idealCompanyStageJson" TEXT NOT NULL DEFAULT '[]',
    "compensationNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "rawText" TEXT NOT NULL DEFAULT '',
    "filePath" TEXT NOT NULL DEFAULT '',
    "isBaseResume" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "target_companies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "companyDomain" TEXT NOT NULL DEFAULT '',
    "careersUrl" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_sources" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "atsProvider" TEXT NOT NULL DEFAULT '',
    "parsingConfigJson" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "company_sources_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "target_companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER,
    "externalJobId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "employmentType" TEXT NOT NULL DEFAULT '',
    "descriptionRaw" TEXT NOT NULL DEFAULT '',
    "descriptionClean" TEXT NOT NULL DEFAULT '',
    "jobUrl" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'manual_entry',
    "sourceProvider" TEXT NOT NULL DEFAULT '',
    "sourceLabel" TEXT NOT NULL DEFAULT '',
    "postedAt" DATETIME,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "normalizedKey" TEXT NOT NULL DEFAULT '',
    "hashSignature" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "job_postings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "target_companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobPostingId" INTEGER NOT NULL,
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "fitLabel" TEXT NOT NULL DEFAULT 'low',
    "scoreBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "matchingReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "concernsJson" TEXT NOT NULL DEFAULT '[]',
    "redFlagsJson" TEXT NOT NULL DEFAULT '[]',
    "fitSummary" TEXT NOT NULL DEFAULT '',
    "insightSnippet" TEXT NOT NULL DEFAULT '',
    "strengthsJson" TEXT NOT NULL DEFAULT '[]',
    "recommendedResumePointsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "job_matches_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "generated_assets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobPostingId" INTEGER NOT NULL,
    "resumeId" INTEGER,
    "assetType" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "modelName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "generated_assets_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_assets_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobPostingId" INTEGER,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputJson" TEXT NOT NULL DEFAULT '{}',
    "outputJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "agent_runs_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER,
    "sourceId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsCreated" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "jobsMarkedInactive" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'generic_html',
    "message" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "scan_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "target_companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "scan_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "company_sources" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobPostingId" INTEGER,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_notes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobPostingId" INTEGER NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "job_notes_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobPostingId" INTEGER,
    CONSTRAINT "activity_logs_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "minRelevantScore" INTEGER NOT NULL DEFAULT 55,
    "autoScanIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "autoRunFitAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "fitAnalysisThreshold" INTEGER NOT NULL DEFAULT 55,
    "jobsFeedJson" TEXT NOT NULL DEFAULT '{}',
    "savedJobViewsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "job_matches_jobPostingId_key" ON "job_matches"("jobPostingId");
