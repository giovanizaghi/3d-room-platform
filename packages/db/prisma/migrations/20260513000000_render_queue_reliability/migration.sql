-- Rename enum value pending -> queued
ALTER TYPE "RenderStatus" RENAME VALUE 'pending' TO 'queued';

-- Add new enum values
ALTER TYPE "RenderStatus" ADD VALUE 'failed';
ALTER TYPE "RenderStatus" ADD VALUE 'stalled';

-- AlterTable: add new columns
ALTER TABLE "Render"
  ADD COLUMN "queuedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "startedAt"       TIMESTAMP(3),
  ADD COLUMN "completedAt"     TIMESTAMP(3),
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "progress"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "progressLabel"   TEXT,
  ADD COLUMN "lastLogLine"     TEXT,
  ADD COLUMN "errorMessage"    TEXT,
  ADD COLUMN "attempts"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retriedFromId"   TEXT;

-- AlterTable: update default status value (new rows use 'queued')
ALTER TABLE "Render" ALTER COLUMN "status" SET DEFAULT 'queued';

-- AddForeignKey for retry lineage
ALTER TABLE "Render" ADD CONSTRAINT "Render_retriedFromId_fkey"
  FOREIGN KEY ("retriedFromId") REFERENCES "Render"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Render_modelId_status_idx" ON "Render"("modelId", "status");
CREATE INDEX "Render_status_lastHeartbeatAt_idx" ON "Render"("status", "lastHeartbeatAt");
CREATE INDEX "Render_createdAt_idx" ON "Render"("createdAt");
CREATE INDEX "Render_retriedFromId_idx" ON "Render"("retriedFromId");
