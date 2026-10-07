-- Laporan menjumlahkan transaksi APPROVED dalam rentang tanggal.
CREATE INDEX "idx_transactions_status_transaction_date" ON "transactions"("status", "transaction_date");
