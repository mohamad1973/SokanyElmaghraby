-- Group-buy / Vendor tables for Sokany (Tooliano idea port)
-- Import after final/database/schema.sql into the same Prisma MySQL database.
-- Does NOT touch WooCommerce tables on sokany-eg.com.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `GbUser` (
  `id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `disabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GbUser_username_key`(`username`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GbVendorProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `companyName` VARCHAR(191) NOT NULL,
  `contactName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `contactEmail` VARCHAR(191) NOT NULL,
  `address` TEXT NOT NULL,
  `businessType` VARCHAR(191) NOT NULL,
  `teamSize` INTEGER NOT NULL DEFAULT 1,
  `productTypesDescription` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `adminNote` TEXT NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GbVendorProfile_userId_key`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GbProductSubmission` (
  `id` VARCHAR(191) NOT NULL,
  `vendorId` VARCHAR(191) NOT NULL,
  `productName` VARCHAR(191) NOT NULL,
  `productType` VARCHAR(191) NOT NULL,
  `productCondition` VARCHAR(191) NOT NULL DEFAULT 'NEW',
  `productDescription` TEXT NOT NULL,
  `suggestedQuantity` INTEGER NOT NULL,
  `suggestedRetailPrice` DOUBLE NULL,
  `suggestedGroupPrice` DOUBLE NULL,
  `vendorSettlementUnitPrice` DOUBLE NULL,
  `productImageUrl` VARCHAR(500) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `adminNote` TEXT NULL,
  `reviewedAt` DATETIME(3) NULL,
  `wooProductId` INTEGER NULL,
  `campaignEndsAt` DATETIME(3) NULL,
  `dealDurationDays` INTEGER NOT NULL DEFAULT 7,
  `reservedQuantity` INTEGER NOT NULL DEFAULT 0,
  `publishedOnStore` BOOLEAN NOT NULL DEFAULT false,
  `adminHidden` BOOLEAN NOT NULL DEFAULT false,
  `wooSyncStatus` VARCHAR(191) NOT NULL DEFAULT 'none',
  `campaignOutcome` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `GbProductSubmission_status_publishedOnStore_adminHidden_idx`(`status`, `publishedOnStore`, `adminHidden`),
  INDEX `GbProductSubmission_campaignEndsAt_idx`(`campaignEndsAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GbGroupBuyOrder` (
  `id` VARCHAR(191) NOT NULL,
  `buyerId` VARCHAR(191) NOT NULL,
  `submissionId` VARCHAR(191) NOT NULL,
  `wooCustomerId` INTEGER NULL,
  `quantity` INTEGER NOT NULL,
  `unitGroupPrice` DOUBLE NOT NULL,
  `lineTotal` DOUBLE NOT NULL,
  `depositPercent` DOUBLE NOT NULL DEFAULT 5,
  `depositAmount` DOUBLE NOT NULL,
  `codAmount` DOUBLE NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_PAYMENT',
  `paymentRef` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `GbGroupBuyOrder_buyerId_idx`(`buyerId`),
  INDEX `GbGroupBuyOrder_submissionId_status_idx`(`submissionId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GbVendorProfile`
  ADD CONSTRAINT `GbVendorProfile_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `GbUser`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GbProductSubmission`
  ADD CONSTRAINT `GbProductSubmission_vendorId_fkey`
  FOREIGN KEY (`vendorId`) REFERENCES `GbUser`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GbGroupBuyOrder`
  ADD CONSTRAINT `GbGroupBuyOrder_buyerId_fkey`
  FOREIGN KEY (`buyerId`) REFERENCES `GbUser`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GbGroupBuyOrder`
  ADD CONSTRAINT `GbGroupBuyOrder_submissionId_fkey`
  FOREIGN KEY (`submissionId`) REFERENCES `GbProductSubmission`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
