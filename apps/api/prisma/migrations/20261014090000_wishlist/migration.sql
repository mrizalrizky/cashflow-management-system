-- CreateEnum
CREATE TYPE "wishlist_status" AS ENUM ('WAITING', 'BOUGHT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ai_verdict" AS ENUM ('IMPULSIVE', 'NEEDS_THOUGHT', 'PLANNED');

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "similar_owned" TEXT NOT NULL,
    "value_added" TEXT NOT NULL,
    "usage_duration" TEXT NOT NULL,
    "include_finance" BOOLEAN NOT NULL DEFAULT true,
    "status" "wishlist_status" NOT NULL DEFAULT 'WAITING',
    "ai_verdict" "ai_verdict",
    "ai_reasons" JSONB,
    "ai_suggestion" TEXT,
    "ai_finance_snapshot" JSONB,
    "ai_reviewed_at" TIMESTAMP(3),
    "ai_model" TEXT,
    "answers_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_wishlist_items_status_created_at" ON "wishlist_items"("status", "created_at");


-- Aturan data wishlist (spec P3, bagian Data).
ALTER TABLE "wishlist_items" ADD CONSTRAINT "chk_wishlist_items_price_positive" CHECK ("price" > 0);
ALTER TABLE "wishlist_items" ADD CONSTRAINT "chk_wishlist_items_answer_length" CHECK (
  char_length("reason") <= 1000 AND char_length("similar_owned") <= 1000
  AND char_length("value_added") <= 1000 AND char_length("usage_duration") <= 1000
);
