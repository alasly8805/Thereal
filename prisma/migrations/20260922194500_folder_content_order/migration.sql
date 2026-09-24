-- CreateEnum
CREATE TYPE "FolderContentType" AS ENUM ('VIDEO', 'HOMEWORK', 'ATTACHMENT', 'EXAM');

-- CreateTable
CREATE TABLE "FolderContent" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "contentType" "FolderContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FolderContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FolderContent_folderId_contentType_contentId_key" ON "FolderContent"("folderId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "FolderContent_folderId_order_idx" ON "FolderContent"("folderId", "order");

-- AddForeignKey
ALTER TABLE "FolderContent" ADD CONSTRAINT "FolderContent_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
