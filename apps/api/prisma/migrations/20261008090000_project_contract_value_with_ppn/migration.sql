-- Nilai kontrak berikut PPN, terpisah dari nilai kontrak.
ALTER TABLE "projects" ADD COLUMN "contract_value_with_ppn" BIGINT NOT NULL DEFAULT 0;

-- Proyek yang sudah ada: ringkasannya selama ini diukur terhadap nilai kontrak, jadi nilai itu
-- dipakai sebagai nilai awal supaya sisa dan persentasenya tidak berubah. Admin menyesuaikannya.
UPDATE "projects" SET "contract_value_with_ppn" = "contract_value";
