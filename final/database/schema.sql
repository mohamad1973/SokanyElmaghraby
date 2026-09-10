-- CreateTable
CREATE TABLE `CategoryMenuSelection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoryId` INTEGER NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `showInMenu` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `parentOverride` INTEGER NULL,
    `iconUrl` VARCHAR(500) NULL,
    `menuTitle` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CategoryMenuSelection_categoryId_key`(`categoryId`),
    INDEX `CategoryMenuSelection_slug_idx`(`slug`),
    INDEX `CategoryMenuSelection_showInMenu_idx`(`showInMenu`),
    INDEX `CategoryMenuSelection_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wooOrderId` INTEGER NOT NULL,
    `wooOrderNumber` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `codAmount` DECIMAL(10, 2) NOT NULL,
    `governorate` VARCHAR(191) NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `addressLine` TEXT NOT NULL,
    `receiverName` VARCHAR(191) NOT NULL,
    `receiverPhone` VARCHAR(191) NOT NULL,
    `lat` DECIMAL(10, 7) NULL,
    `lng` DECIMAL(10, 7) NULL,
    `rawPayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shipment_wooOrderId_key`(`wooOrderId`),
    INDEX `Shipment_provider_idx`(`provider`),
    INDEX `Shipment_status_idx`(`status`),
    INDEX `Shipment_trackingNumber_idx`(`trackingNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Driver` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `maxOrders` INTEGER NOT NULL DEFAULT 20,
    `maxCodValue` DECIMAL(12, 2) NOT NULL DEFAULT 50000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Driver_phone_key`(`phone`),
    UNIQUE INDEX `Driver_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryZone` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `governorate` VARCHAR(191) NOT NULL,
    `parentId` INTEGER NULL,
    `polygon` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryZone_governorate_idx`(`governorate`),
    INDEX `DeliveryZone_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriverZone` (
    `driverId` INTEGER NOT NULL,
    `zoneId` INTEGER NOT NULL,

    PRIMARY KEY (`driverId`, `zoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driverId` INTEGER NOT NULL,
    `runDate` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `routePolyline` TEXT NULL,
    `totalOrders` INTEGER NOT NULL DEFAULT 0,
    `totalCod` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryRun_runDate_idx`(`runDate`),
    INDEX `DeliveryRun_status_idx`(`status`),
    UNIQUE INDEX `DeliveryRun_driverId_runDate_key`(`driverId`, `runDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `runId` INTEGER NOT NULL,
    `shipmentId` INTEGER NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `otpHash` VARCHAR(191) NULL,
    `otpSentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `failReason` TEXT NULL,
    `lat` DECIMAL(10, 7) NULL,
    `lng` DECIMAL(10, 7) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DeliveryAssignment_shipmentId_key`(`shipmentId`),
    INDEX `DeliveryAssignment_runId_idx`(`runId`),
    INDEX `DeliveryAssignment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerWishlist` (
    `customerId` INTEGER NOT NULL,
    `entries` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialProofEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productName` VARCHAR(512) NOT NULL,
    `productCode` VARCHAR(128) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialProofEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DeliveryZone` ADD CONSTRAINT `DeliveryZone_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `DeliveryZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverZone` ADD CONSTRAINT `DriverZone_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverZone` ADD CONSTRAINT `DriverZone_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `DeliveryZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryRun` ADD CONSTRAINT `DeliveryRun_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `DeliveryRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
