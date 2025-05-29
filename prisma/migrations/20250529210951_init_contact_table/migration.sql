-- CreateTable
CREATE TABLE `Contact` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phoneNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `linkedId` INTEGER NULL,
    `linkPrecedence` ENUM('primary', 'secondary') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Contact_email_idx`(`email`),
    INDEX `Contact_phoneNumber_idx`(`phoneNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_linkedId_fkey` FOREIGN KEY (`linkedId`) REFERENCES `Contact`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
