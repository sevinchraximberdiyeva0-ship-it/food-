-- Additive metadata only. No user is created/promoted and no data is removed.
CREATE TABLE "PlatformBootstrap" (
    "key" TEXT NOT NULL,
    "createdAdminId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformBootstrap_pkey" PRIMARY KEY ("key")
);
