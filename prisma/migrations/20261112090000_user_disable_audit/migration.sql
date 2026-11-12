CREATE TABLE "UserDisableAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "beforeStatus" TEXT NOT NULL,
    "afterStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "UserDisableAudit_targetUserId_createdAt_idx" ON "UserDisableAudit"("targetUserId", "createdAt");
CREATE INDEX "UserDisableAudit_actorId_createdAt_idx" ON "UserDisableAudit"("actorId", "createdAt");
