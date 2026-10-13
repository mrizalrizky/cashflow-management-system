import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import Select from 'primevue/select'
import { ApiError } from '@/api/http'
import * as wishlistApi from '@/api/wishlist'
import type { WishlistItem, WishlistReview } from '@/api/types'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import WishlistDetailView from '../WishlistDetailView.vue'
import WishlistView from '../WishlistView.vue'

vi.mock('@/api/wishlist')

const REVIEW: WishlistReview = {
  verdict: 'NEEDS_THOUGHT',
  reasons: ['Sudah punya laptop yang masih jalan', 'Harganya besar'],
  suggestion: 'Tunggu 30 hari.',
  financeSnapshot: {
    totalBalance: '12500000',
    months: ['2026-07', '2026-08', '2026-09'],
    averageMonthlyIncome: '8000000',
    averageMonthlyExpense: '6000000',
    unpaidInstallments: { count: 0, monthlyTotal: '0', lastEndMonth: null },
  },
  reviewedAt: '2026-10-12T03:00:00.000Z',
  model: 'claude-opus-5-5',
  answersChanged: false,
}

function makeItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 'w-laptop',
    name: 'Laptop',
    price: '15000000',
    reason: 'Laptop lama lambat',
    similarOwned: 'Ya, laptop 2018',
    valueAdded: 'Kerja lebih cepat',
    usageDuration: '4 tahun',
    includeFinance: true,
    status: 'WAITING',
    review: null,
    createdAt: '2026-10-10T03:00:00.000Z',
    updatedAt: '2026-10-10T03:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  signIn()
})

describe('WishlistView', () => {
  beforeEach(() => {
    vi.mocked(wishlistApi.listWishlist).mockResolvedValue([
      makeItem(),
      makeItem({ id: 'w-sepatu', name: 'Sepatu', price: '900000', review: { ...REVIEW, verdict: 'IMPULSIVE' } }),
    ])
  })

  it('lists items with price, status and verdict, waiting ones first', async () => {
    const { wrapper } = await mountView(WishlistView, { path: '/wishlist', withOverlays: true })

    expect(wishlistApi.listWishlist).toHaveBeenLastCalledWith({ status: 'WAITING' })
    const laptop = wrapper.get('[data-testid="wish-w-laptop"]')
    expect(laptop.text()).toContain('Rp 15.000.000')
    expect(laptop.text()).toContain('Menunggu')
    expect(laptop.text()).toContain('Belum dinilai')
    expect(laptop.find('a[href="/wishlist/w-laptop"]').text()).toBe('Laptop')
    expect(wrapper.get('[data-testid="wish-w-sepatu"]').text()).toContain('Impulsif')
  })

  it('filters by status', async () => {
    const { wrapper } = await mountView(WishlistView, { path: '/wishlist', withOverlays: true })
    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'BOUGHT')
    await flushPromises()
    expect(wishlistApi.listWishlist).toHaveBeenLastCalledWith({ status: 'BOUGHT' })
  })

  it('adds an item with the six answers, the finance summary on by default', async () => {
    vi.mocked(wishlistApi.createWishlistItem).mockResolvedValue(makeItem())
    const { wrapper } = await mountView(WishlistView, { path: '/wishlist', withOverlays: true })

    await wrapper.get('[data-testid="add-wish"]').trigger('click')
    expect((wrapper.get('#wish-finance').element as HTMLInputElement).checked).toBe(true)
    await fill(wrapper, '#wish-name', ' Laptop ')
    await fill(wrapper, '#wish-price', '15000000')
    await fill(wrapper, '#wish-reason', 'Laptop lama lambat')
    await fill(wrapper, '#wish-similar', 'Ya, laptop 2018')
    await fill(wrapper, '#wish-value', 'Kerja lebih cepat')
    await fill(wrapper, '#wish-duration', '4 tahun')
    await submitForm(wrapper)

    expect(wishlistApi.createWishlistItem).toHaveBeenCalledWith({
      name: 'Laptop',
      price: '15000000',
      reason: 'Laptop lama lambat',
      similarOwned: 'Ya, laptop 2018',
      valueAdded: 'Kerja lebih cepat',
      usageDuration: '4 tahun',
      includeFinance: true,
    })
  })

  it('asks for every answer and shows how much of the 1,000 characters is used', async () => {
    const { wrapper } = await mountView(WishlistView, { path: '/wishlist', withOverlays: true })
    await wrapper.get('[data-testid="add-wish"]').trigger('click')
    await fill(wrapper, '#wish-reason', 'abc')
    expect(wrapper.get('[data-testid="wish-reason-count"]').text()).toBe('3/1000')
    expect(wrapper.get('#wish-reason').attributes('maxlength')).toBe('1000')

    await submitForm(wrapper)
    expect(wrapper.get('#wish-similar-error').text()).toContain('wajib diisi')
    expect(wishlistApi.createWishlistItem).not.toHaveBeenCalled()
  })
})

describe('WishlistDetailView', () => {
  async function mountDetail(item: WishlistItem) {
    vi.mocked(wishlistApi.getWishlistItem).mockResolvedValue(item)
    return mountView(WishlistDetailView, { path: `/wishlist/${item.id}`, withOverlays: true })
  }

  it('shows the six answers and an empty review card', async () => {
    const { wrapper } = await mountDetail(makeItem())
    expect(wrapper.get('h1').text()).toBe('Laptop')
    expect(wrapper.text()).toContain('Laptop lama lambat')
    expect(wrapper.text()).toContain('4 tahun')
    expect(wrapper.get('[data-testid="review-card"]').text()).toContain('Belum ada penilaian')
  })

  it('asks the AI and shows the verdict, reasons, suggestion and that the summary was included', async () => {
    vi.mocked(wishlistApi.reviewWishlistItem).mockResolvedValue(makeItem({ review: REVIEW }))
    const { wrapper } = await mountDetail(makeItem())

    await wrapper.get('[data-testid="ask-ai"]').trigger('click')
    await flushPromises()

    expect(wishlistApi.reviewWishlistItem).toHaveBeenCalledWith('w-laptop')
    const card = wrapper.get('[data-testid="review-card"]')
    expect(card.text()).toContain('Perlu dipikirkan')
    expect(card.text()).toContain('Sudah punya laptop yang masih jalan')
    expect(card.text()).toContain('Tunggu 30 hari.')
    expect(card.text()).toContain('Termasuk ringkasan keuangan')
  })

  it('disables the button while the AI is thinking', async () => {
    let finish: (item: WishlistItem) => void = () => undefined
    vi.mocked(wishlistApi.reviewWishlistItem).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountDetail(makeItem())

    await wrapper.get('[data-testid="ask-ai"]').trigger('click')
    expect(wrapper.get('[data-testid="ask-ai"]').attributes('disabled')).toBeDefined()
    finish(makeItem({ review: REVIEW }))
    await flushPromises()
    expect(wrapper.get('[data-testid="ask-ai"]').attributes('disabled')).toBeUndefined()
  })

  it('shows why the review failed and keeps the old one', async () => {
    vi.mocked(wishlistApi.reviewWishlistItem).mockRejectedValue(
      new ApiError(503, 'Penilaian AI belum diaktifkan di server.'),
    )
    const { wrapper } = await mountDetail(makeItem({ review: REVIEW }))

    await wrapper.get('[data-testid="ask-ai"]').trigger('click')
    await flushPromises()

    const card = wrapper.get('[data-testid="review-card"]')
    expect(card.text()).toContain('Penilaian AI belum diaktifkan di server.')
    expect(card.text()).toContain('Perlu dipikirkan')
  })

  it('marks a review whose answers changed since', async () => {
    const { wrapper } = await mountDetail(makeItem({ review: { ...REVIEW, answersChanged: true } }))
    expect(wrapper.get('[data-testid="review-card"]').text()).toContain('Jawaban sudah diubah sejak penilaian ini')
  })

  it('cancels a waiting item, and offers to move a closed one back', async () => {
    vi.mocked(wishlistApi.updateWishlistItem).mockResolvedValue(makeItem({ status: 'CANCELLED' }))
    const { wrapper } = await mountDetail(makeItem())

    await wrapper.get('[data-testid="mark-cancelled"]').trigger('click')
    await flushPromises()

    expect(wishlistApi.updateWishlistItem).toHaveBeenCalledWith('w-laptop', { status: 'CANCELLED' })
    expect(wrapper.find('[data-testid="mark-waiting"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mark-cancelled"]').exists()).toBe(false)
  })

  it('says when the item does not exist', async () => {
    vi.mocked(wishlistApi.getWishlistItem).mockRejectedValue(new ApiError(404, 'Barang tidak ditemukan'))
    const { wrapper } = await mountView(WishlistDetailView, { path: '/wishlist/w-x', withOverlays: true })
    expect(wrapper.text()).toContain('Barang tidak ditemukan')
  })
})
