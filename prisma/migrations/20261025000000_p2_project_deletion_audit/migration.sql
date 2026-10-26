CREATE TABLE "ProjectDeletionAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProjectDeletionAudit_projectId_deletedAt_idx" ON "ProjectDeletionAudit"("projectId", "deletedAt");
CREATE INDEX "ProjectDeletionAudit_actorId_deletedAt_idx" ON "ProjectDeletionAudit"("actorId", "deletedAt");
