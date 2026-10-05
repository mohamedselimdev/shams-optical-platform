-- AlterTable
ALTER TABLE "brand" ADD COLUMN     "descriptionEn" TEXT;

-- AlterTable
ALTER TABLE "category" ADD COLUMN     "descriptionEn" TEXT;

-- AlterTable
ALTER TABLE "collection" ADD COLUMN     "descriptionEn" TEXT;

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "variantNameEn" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "frameMaterialEn" TEXT;

-- AlterTable
ALTER TABLE "product_variant" ADD COLUMN     "colorNameEn" TEXT;
