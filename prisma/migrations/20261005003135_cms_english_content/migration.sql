-- AlterTable
ALTER TABLE "announcement" ADD COLUMN     "messageEn" TEXT;

-- AlterTable
ALTER TABLE "banner" ADD COLUMN     "ctaLabelEn" TEXT,
ADD COLUMN     "subtitleEn" TEXT,
ADD COLUMN     "titleEn" TEXT;

-- AlterTable
ALTER TABLE "content_page" ADD COLUMN     "blocksEn" JSONB,
ADD COLUMN     "titleEn" TEXT;

-- AlterTable
ALTER TABLE "home_section" ADD COLUMN     "titleEn" TEXT;

-- AlterTable
ALTER TABLE "navigation_item" ADD COLUMN     "labelEn" TEXT;
