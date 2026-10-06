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
