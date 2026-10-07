// Bagian uji asap yang butuh browser sungguhan: membuka aplikasi hasil build lewat proxy
// produksi dan memastikan aturan keamanan browser (Content-Security-Policy) tidak mematikan
// apa pun. Dipanggil oleh deploy/smoke.sh.
//
//   node deploy/smoke-browser.mjs <alamat> <email> <password>
import { chromium } from '@playwright/test'

const [base, email, password] = process.argv.slice(2)
if (!base || !email || !password) {
  console.error('pemakaian: node deploy/smoke-browser.mjs <alamat> <email> <password>')
  process.exit(2)
}

const problems = []
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  // Tiap pelanggaran CSP dicatat browser sebagai peristiwa; dikumpulkan di semua halaman.
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  const violations = async () => page.evaluate(() => window.__cspViolations)
  const collect = async (where) => {
    for (const violation of await violations()) problems.push(`CSP di ${where}: ${violation}`)
  }
  page.on('pageerror', (error) => problems.push(`galat halaman: ${error.message}`))

  await page.goto(`${base}/login`)
  const submit = page.getByRole('button', { name: 'Masuk' })
  await submit.waitFor()
  // Gaya PrimeVue disisipkan sebagai <style>; bila CSP menolaknya, tombol utama tidak berwarna.
  const styled = await submit.evaluate((button) => {
    const background = getComputedStyle(button).backgroundColor
    return background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent'
  })
  if (!styled) problems.push('gaya PrimeVue tidak diterapkan pada tombol Masuk')
  await collect('/login')

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await submit.click()
  await page.waitForURL(/\/dashboard$/)
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
  await collect('/dashboard')

  // Halaman yang dimuat belakangan (potongan kode terpisah) dan sebuah dialog.
  await page.getByTestId('sidebar').getByRole('link', { name: 'Transaksi' }).click()
  await page.getByRole('heading', { name: 'Transaksi' }).waitFor()
  await page.getByRole('button', { name: 'Catat transaksi' }).click()
  await page.getByRole('dialog').waitFor()
  await collect('/transaksi')

  // Alamat dalam yang dibuka langsung: sesi dipulihkan dari cookie, lalu halamannya tampil.
  await page.goto(`${base}/audit-log`)
  await page.getByRole('heading', { name: 'Audit log' }).waitFor()
  await collect('/audit-log')
} catch (error) {
  problems.push(`alur gagal: ${error.message}`)
} finally {
  await browser.close()
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('browser: login, halaman dan gaya berjalan tanpa pelanggaran aturan keamanan')
