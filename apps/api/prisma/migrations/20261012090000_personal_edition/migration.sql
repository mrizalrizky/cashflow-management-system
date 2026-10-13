-- Edisi pribadi: tanpa proyek, persetujuan, email, password, dan peran.
-- Dipasang pada database baru. Pada database berisi transaksi PENDING atau REJECTED,
-- perubahan tipe tx_status gagal dengan sengaja: data perusahaan tidak dipindahkan.

-- AlterEnum
BEGIN;
CREATE TYPE "tx_status_new" AS ENUM ('APPROVED', 'VOID');
ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "tx_status_new" USING ("status"::text::"tx_status_new");
ALTER TYPE "tx_status" RENAME TO "tx_status_old";
ALTER TYPE "tx_status_new" RENAME TO "tx_status";
DROP TYPE "tx_status_old";
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
COMMIT;

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_assigned_by_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_project_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reviewed_by_id_fkey";

-- DropIndex
DROP INDEX "uq_users_email";

-- DropIndex
DROP INDEX "idx_transactions_project_id_status";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email",
DROP COLUMN "is_active",
DROP COLUMN "must_change_password",
DROP COLUMN "password_hash",
DROP COLUMN "role",
ADD COLUMN     "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_locked_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "project_id",
DROP COLUMN "reject_reason",
DROP COLUMN "reviewed_at",
DROP COLUMN "reviewed_by_id",
ALTER COLUMN "status" SET DEFAULT 'APPROVED';

-- DropTable
DROP TABLE "projects";

-- DropTable
DROP TABLE "project_members";

-- DropEnum
DROP TYPE "role";

-- DropEnum
DROP TYPE "project_status";

