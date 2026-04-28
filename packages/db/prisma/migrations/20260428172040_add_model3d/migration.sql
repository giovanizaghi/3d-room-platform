/*
  Warnings:

  - Added the required column `modelId` to the `Render` table without a default value. This is not possible if the table is not empty.

*/
-- Dev: clear existing render rows so modelId NOT NULL can be added cleanly
TRUNCATE TABLE "Render";

-- AlterTable
ALTER TABLE "Render" ADD COLUMN     "cameraPreset" TEXT NOT NULL DEFAULT 'perspective',
ADD COLUMN     "modelId" TEXT NOT NULL,
ALTER COLUMN "items" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Model3D" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "blendFilePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Model3D_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Render" ADD CONSTRAINT "Render_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model3D"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
