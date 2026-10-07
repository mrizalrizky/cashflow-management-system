import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DatePicker from 'primevue/datepicker'
import { freshPinia, mountView } from '@/test/mount'
import DateField from '../DateField.vue'
import MoneyInput from '../MoneyInput.vue'

beforeEach(() => {
  freshPinia()
  document.body.innerHTML = ''
})

describe('MoneyInput', () => {
  async function mountMoney(props: Record<string, unknown> = {}) {
    const { wrapper } = await mountView(MoneyInput, { props: { id: 'amount', modelValue: '', ...props } })
    return wrapper
  }

  function shown(wrapper: VueWrapper): string {
    return (wrapper.get('input').element as HTMLInputElement).value
  }

  async function type(wrapper: VueWrapper, text: string): Promise<void> {
    await wrapper.get('input').setValue(text)
    await flushPromises()
  }

  function emitted(wrapper: VueWrapper): unknown[] {
    return (wrapper.emitted('update:modelValue') ?? []).map((args) => args[0])
  }

  it('shows the amount grouped by thousands', async () => {
    expect(shown(await mountMoney({ modelValue: '1250000' }))).toBe('1.250.000')
    expect(shown(await mountMoney({ modelValue: '' }))).toBe('')
  })

  it('emits clean digits while showing them grouped', async () => {
    const wrapper = await mountMoney()

    await type(wrapper, '2500000')

    expect(emitted(wrapper)).toEqual(['2500000'])
    expect(shown(wrapper)).toBe('2.500.000')
  })

  it('understands a pasted formatted amount', async () => {
    const wrapper = await mountMoney()
    await type(wrapper, 'Rp 3.000.000')
    expect(emitted(wrapper)).toEqual(['3000000'])
    expect(shown(wrapper)).toBe('3.000.000')
  })

  it('ignores input that is not an amount, keeping what was there', async () => {
    const wrapper = await mountMoney({ modelValue: '1250000' })

    await type(wrapper, '1.250.000x')
    await type(wrapper, '12,5')

    expect(emitted(wrapper)).toEqual([])
    expect(shown(wrapper)).toBe('1.250.000')
  })

  it('emits an empty string when cleared', async () => {
    const wrapper = await mountMoney({ modelValue: '1250000' })
    await type(wrapper, '')
    expect(emitted(wrapper)).toEqual([''])
    expect(shown(wrapper)).toBe('')
  })

  it('accepts a negative amount only when allowed', async () => {
    const strict = await mountMoney()
    await type(strict, '-500000')
    expect(emitted(strict)).toEqual([])

    const signed = await mountMoney({ allowNegative: true })
    await type(signed, '-')
    expect(shown(signed)).toBe('-')
    await type(signed, '-500000')
    expect(emitted(signed)).toEqual(['-500000'])
    expect(shown(signed)).toBe('-500.000')
  })

  /** Mengetik di tengah teks: isi kotak dan posisi kursor setelah ketukan, seperti yang dilaporkan browser. */
  async function typeAt(wrapper: VueWrapper, text: string, caret: number): Promise<HTMLInputElement> {
    const input = wrapper.get('input').element as HTMLInputElement
    input.value = text
    input.setSelectionRange(caret, caret)
    await wrapper.get('input').trigger('input')
    await flushPromises()
    return input
  }

  it('keeps the caret where the person is typing when the grouping changes', async () => {
    const wrapper = await mountMoney({ modelValue: '999' })

    // Kursor di awal, mengetik "1": browser melaporkan "1999" dengan kursor setelah angka 1.
    const input = await typeAt(wrapper, '1999', 1)

    expect(input.value).toBe('1.999')
    expect(input.selectionStart).toBe(1)

    // Lalu "2" di posisi yang sama: harus menjadi 12.999, bukan 19.992.
    await typeAt(wrapper, '12.999', 2)
    expect(emitted(wrapper)).toEqual(['1999', '12999'])
    expect(input.selectionStart).toBe(2)
  })

  it('keeps the caret in place when a separator is deleted', async () => {
    const wrapper = await mountMoney({ modelValue: '1250000' })

    // Backspace atas titik pertama: "1250.000" dengan kursor setelah angka 1.
    const input = await typeAt(wrapper, '1250.000', 1)

    expect(input.value).toBe('1.250.000')
    expect(input.selectionStart).toBe(1)
    expect(emitted(wrapper)).toEqual([])
  })

  function paste(wrapper: VueWrapper, text: string) {
    return wrapper.get('input').trigger('paste', { clipboardData: { getData: () => text } })
  }

  it('replaces the amount with a pasted one', async () => {
    const wrapper = await mountMoney({ modelValue: '100' })

    await paste(wrapper, 'Rp 3.000.000')
    await flushPromises()

    expect(emitted(wrapper)).toEqual(['3000000'])
    expect(shown(wrapper)).toBe('3.000.000')
  })

  it('refuses a pasted decimal amount and says why, instead of misreading it', async () => {
    const wrapper = await mountMoney({ modelValue: '100' })

    await paste(wrapper, '1250000.00')
    await flushPromises()

    expect(emitted(wrapper)).toEqual([])
    expect(shown(wrapper)).toBe('100')
    expect(wrapper.get('[role="status"]').text()).toContain('angka bulat')
  })

  it('explains a refused keystroke and clears the hint on the next valid one', async () => {
    const wrapper = await mountMoney({ modelValue: '100' })

    await type(wrapper, '100x')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    await type(wrapper, '1000')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('drops a minus sign left on its own when the field loses focus', async () => {
    const wrapper = await mountMoney({ allowNegative: true })
    await type(wrapper, '-')

    await wrapper.get('input').trigger('blur')

    expect(shown(wrapper)).toBe('')
  })

  it('follows a value set from outside', async () => {
    const wrapper = await mountMoney({ modelValue: '100' })
    await wrapper.setProps({ modelValue: '7000' })
    expect(shown(wrapper)).toBe('7.000')
  })

  it('is a numeric text field wired for accessibility', async () => {
    const wrapper = await mountMoney({ invalid: true, ariaDescribedby: 'amount-error' })
    const input = wrapper.get('input')
    expect(input.attributes()).toMatchObject({
      id: 'amount',
      inputmode: 'numeric',
      'aria-invalid': 'true',
      'aria-describedby': 'amount-error',
    })
  })
})

describe('DateField', () => {
  async function mountDate(modelValue: string | null) {
    const { wrapper } = await mountView(DateField, { props: { id: 'start', modelValue } })
    return wrapper
  }

  it('hands the picker the same calendar day, whatever the time zone', async () => {
    const wrapper = await mountDate('2026-10-06')
    const value = wrapper.findComponent(DatePicker).props('modelValue') as Date
    expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([2026, 9, 6])
  })

  it('emits YYYY-MM-DD for a picked date and null when cleared', async () => {
    const wrapper = await mountDate(null)
    const picker = wrapper.findComponent(DatePicker)

    picker.vm.$emit('update:modelValue', new Date(2027, 2, 31))
    picker.vm.$emit('update:modelValue', null)

    expect(wrapper.emitted('update:modelValue')).toEqual([['2027-03-31'], [null]])
  })
})
