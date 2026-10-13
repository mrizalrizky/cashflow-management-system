import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import * as installmentsApi from '@/api/installments'
import * as wishlistApi from '@/api/wishlist'
import type { WishlistItem } from '@/api/types'
import { freshPinia, mountView } from '@/test/mount'
import { signIn } from '@/test/session'
import { installmentList, KAS, MATERIAL } from '@/test/transactions'
import WishlistDetailView from '../WishlistDetailView.vue'

vi.mock('@/api/wishlist')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')
vi.mock('@/api/installments')

const ITEM: WishlistItem = {
  id: 'w-laptop',
  name: 'Laptop',
  price: '15000000',
  reason: 'Laptop lama lambat',
  similarOwned: 'Ya',
  valueAdded: 'Kerja lebih cepat',
  usageDuration: '4 tahun',
  includeFinance: true,
  status: 'WAITING',
  review: null,
  createdAt: '2026-10-10T03:00:00.000Z',
  updatedAt: '2026-10-10T03:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  signIn()
  vi.mocked(wishlistApi.getWishlistItem).mockResolvedValue(ITEM)
  vi.mocked(wishlistApi.updateWishlistItem).mockResolvedValue({ ...ITEM, status: 'BOUGHT' })
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL])
  vi.mocked(installmentsApi.listInstallments).mockResolvedValue(installmentList())
})

async function markBought(): Promise<VueWrapper> {
  const { wrapper } = await mountView(WishlistDetailView, { path: '/wishlist/w-laptop', withOverlays: true })
  await wrapper.get('[data-testid="mark-bought"]').trigger('click')
  await flushPromises()
  return wrapper
}

describe('marking a wishlist item bought', () => {
  it('saves the status, then offers to record the expense or start an installment', async () => {
    const wrapper = await markBought()
    expect(wishlistApi.updateWishlistItem).toHaveBeenCalledWith('w-laptop', { status: 'BOUGHT' })
    const offer = wrapper.get('[data-testid="bought-shortcuts"]')
    expect(offer.text()).toContain('Catat pengeluaran')
    expect(offer.text()).toContain('Buat cicilan')
    expect(offer.text()).toContain('Lewati')
  })

  it('opens the expense form filled with the price and the name', async () => {
    const wrapper = await markBought()
    await wrapper.get('[data-testid="shortcut-expense"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('15.000.000')
    expect((wrapper.get('#tx-description').element as HTMLTextAreaElement).value).toBe('Laptop')
  })

  it('opens the installment form with the name, and the price in the notes', async () => {
    const wrapper = await markBought()
    await wrapper.get('[data-testid="shortcut-installment"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('#installment-name').element as HTMLInputElement).value).toBe('Laptop')
    expect((wrapper.get('#installment-notes').element as HTMLTextAreaElement).value).toBe(
      'Harga barang Rp 15.000.000',
    )
  })

  it('can be skipped', async () => {
    const wrapper = await markBought()
    await wrapper.get('[data-testid="shortcut-skip"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="bought-shortcuts"]').exists()).toBe(false)
    expect(wrapper.find('#tx-amount').exists()).toBe(false)
  })

  it('offers nothing when the item is cancelled instead', async () => {
    vi.mocked(wishlistApi.updateWishlistItem).mockResolvedValue({ ...ITEM, status: 'CANCELLED' })
    const { wrapper } = await mountView(WishlistDetailView, { path: '/wishlist/w-laptop', withOverlays: true })
    await wrapper.get('[data-testid="mark-cancelled"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="bought-shortcuts"]').exists()).toBe(false)
  })
})
