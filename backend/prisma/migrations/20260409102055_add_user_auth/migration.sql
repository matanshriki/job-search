-- CreateTable: users
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "googleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- Assign any existing rows to a temporary system user (id=1).
-- On first Google login this user record will be replaced with real auth.
INSERT OR IGNORE INTO "users" ("id", "email", "name", "createdAt", "updatedAt")
VALUES (1, 'system@localhost', 'System', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables with userId
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- app_settings
CREATE TABLE "new_app_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "minRelevantScore" INTEGER NOT NULL DEFAULT 55,
    "autoScanIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "autoRunFitAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "fitAnalysisThreshold" INTEGER NOT NULL DEFAULT 55,
    "jobsFeedJson" TEXT NOT NULL DEFAULT '{}',
    "savedJobViewsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_app_settings" ("id", "userId", "autoRunFitAnalysis", "autoScanIntervalHours", "createdAt", "fitAnalysisThreshold", "jobsFeedJson", "minRelevantScore", "savedJobViewsJson", "updatedAt")
  SELECT "id", 1, "autoRunFitAnalysis", "autoScanIntervalHours", "createdAt", "fitAnalysisThreshold", "jobsFeedJson", "minRelevantScore", "savedJobViewsJson", "updatedAt" FROM "app_settings";
DROP TABLE "app_settings";
ALTER TABLE "new_app_settings" RENAME TO "app_settings";
CREATE UNIQUE INDEX "app_settings_userId_key" ON "app_settings"("userId");

-- profile
CREATE TABLE "new_profile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_profile" ("id", "userId", "compensationNotes", "createdAt", "currentLocation", "email", "excludedKeywordsJson", "excludedTitlesJson", "fullName", "idealCompanyStageJson", "linkedinUrl", "preferredFunctionsJson", "preferredIndustriesJson", "preferredLocationsJson", "preferredTitlesJson", "remotePreference", "seniorityLevel", "summary", "targetKeywordsJson", "updatedAt")
  SELECT "id", 1, "compensationNotes", "createdAt", "currentLocation", "email", "excludedKeywordsJson", "excludedTitlesJson", "fullName", "idealCompanyStageJson", "linkedinUrl", "preferredFunctionsJson", "preferredIndustriesJson", "preferredLocationsJson", "preferredTitlesJson", "remotePreference", "seniorityLevel", "summary", "targetKeywordsJson", "updatedAt" FROM "profile";
DROP TABLE "profile";
ALTER TABLE "new_profile" RENAME TO "profile";

-- resumes
CREATE TABLE "new_resumes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "rawText" TEXT NOT NULL DEFAULT '',
    "filePath" TEXT NOT NULL DEFAULT '',
    "isBaseResume" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resumes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_resumes" ("id", "userId", "createdAt", "filePath", "isBaseResume", "rawText", "title", "updatedAt")
  SELECT "id", 1, "createdAt", "filePath", "isBaseResume", "rawText", "title", "updatedAt" FROM "resumes";
DROP TABLE "resumes";
ALTER TABLE "new_resumes" RENAME TO "resumes";

-- target_companies
CREATE TABLE "new_target_companies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "companyDomain" TEXT NOT NULL DEFAULT '',
    "careersUrl" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "target_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_target_companies" ("id", "userId", "active", "careersUrl", "companyDomain", "createdAt", "name", "notes", "priority", "updatedAt")
  SELECT "id", 1, "active", "careersUrl", "companyDomain", "createdAt", "name", "notes", "priority", "updatedAt" FROM "target_companies";
DROP TABLE "target_companies";
ALTER TABLE "new_target_companies" RENAME TO "target_companies";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
