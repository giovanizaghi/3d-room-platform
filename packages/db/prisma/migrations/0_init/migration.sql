-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('pending', 'processing', 'done');

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL,
    "status" "RenderStatus" NOT NULL DEFAULT 'pending',
    "items" JSONB NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Render_pkey" PRIMARY KEY ("id")
);
