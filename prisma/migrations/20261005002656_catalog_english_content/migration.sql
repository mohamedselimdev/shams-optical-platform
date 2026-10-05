-- AlterTable
ALTER TABLE "lens_index" ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "lens_option" ADD COLUMN     "descriptionEn" TEXT;

-- AlterTable
ALTER TABLE "lens_type" ADD COLUMN     "descriptionEn" TEXT;

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "productNameEn" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "descriptionEn" TEXT;
