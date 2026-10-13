-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "is_installment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "installment_id" TEXT;

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_amount" BIGINT NOT NULL,
    "start_month" DATE NOT NULL,
    "months" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transactions_installment_id_status" ON "transactions"("installment_id", "status");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Aturan data cicilan (spec P2, bagian Data).
ALTER TABLE "installments" ADD CONSTRAINT "chk_installments_monthly_amount_positive" CHECK ("monthly_amount" > 0);
ALTER TABLE "installments" ADD CONSTRAINT "chk_installments_months_range" CHECK ("months" BETWEEN 1 AND 120);
ALTER TABLE "installments" ADD CONSTRAINT "chk_installments_start_month_first_day" CHECK (EXTRACT(DAY FROM "start_month") = 1);
