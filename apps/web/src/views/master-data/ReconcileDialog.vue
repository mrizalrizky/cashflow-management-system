<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Textarea from 'primevue/textarea'
import { reconcileAccount } from '@/api/accounts'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import { formatRupiah, isMoneyString } from '@/lib/money'
import { collectErrors, required } from '@/lib/validation'

/**
 * "Cocokkan saldo": pemilik mengetik saldo sebenarnya (mis. dari aplikasi bank), dan selisihnya
 * dicatat sebagai satu penyesuaian yang tidak dihitung sebagai pemasukan atau pengeluaran.
 */
const props = defineProps<{
  account: { id: string; name: string; balance: string }
}>()
const emit = defineEmits<{ reconciled: [] }>()
const visible = defineModel<boolean>('visible', { required: true })

const notify = useNotify()
const DEFAULT_DESCRIPTION = 'Penyesuaian saldo'
const form = reactive({ actualBalance: '', description: DEFAULT_DESCRIPTION })

watch(
  visible,
  (open) => {
    if (!open) return
    form.actualBalance = ''
    form.description = DEFAULT_DESCRIPTION
    reset()
  },
)

/** Saldo sebenarnya dikurangi yang tercatat; null selama isian belum berupa nominal. */
const difference = computed(() =>
  isMoneyString(form.actualBalance, true) ? BigInt(form.actualBalance) - BigInt(props.account.balance) : null,
)

function signed(amount: bigint): string {
  return `${amount < 0n ? '-' : '+'}${formatRupiah((amount < 0n ? -amount : amount).toString())}`
}

const preview = computed(() => {
  const diff = difference.value
  if (diff === null) return null
  if (diff === 0n) return 'Saldo sudah cocok; tidak ada yang dicatat.'
  return `Selisih ${signed(diff)}, dicatat sebagai ${diff < 0n ? 'Selisih keluar' : 'Selisih masuk'}.`
})

const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(() =>
  reconcileAccount(props.account.id, {
    actualBalance: form.actualBalance,
    description: form.description.trim() === '' ? DEFAULT_DESCRIPTION : form.description.trim(),
  }),
)

async function onSubmit(): Promise<void> {
  const result = await submit(collectErrors(form, { actualBalance: [required('Saldo sebenarnya')] }))
  if (!result.ok) return
  const { transaction, difference: recorded, actualBalance } = result.value
  if (transaction === null) notify.success(`Saldo ${props.account.name} sudah cocok.`)
  else {
    notify.success(
      `Selisih ${signed(BigInt(recorded))} dicatat. Saldo ${props.account.name} sekarang ${formatRupiah(actualBalance)}.`,
    )
  }
  emit('reconciled')
  visible.value = false
}
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="`Cocokkan saldo ${account.name}`"
    :submitting="submitting"
    :form-error="formError"
    submit-label="Simpan"
    @submit="onSubmit"
  >
    <p class="text-sm text-surface-600" data-testid="recorded-balance">
      Saldo tercatat: <MoneyText :amount="account.balance" class="font-medium" />
    </p>
    <FormField id="actual-balance" v-slot="field" label="Saldo sebenarnya (Rp)" :error="fieldErrors.actualBalance">
      <MoneyInput
        :id="field.id"
        v-model="form.actualBalance"
        allow-negative
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
    </FormField>
    <p v-if="preview" class="text-sm font-medium" data-testid="reconcile-preview">{{ preview }}</p>
    <FormField id="reconcile-description" v-slot="field" label="Keterangan" :error="fieldErrors.description">
      <Textarea :id="field.id" v-model="form.description" rows="2" :aria-describedby="field.describedBy" fluid />
    </FormField>
    <p class="text-xs text-surface-500">
      Selisih mengubah saldo akun, tetapi tidak dihitung sebagai pemasukan atau pengeluaran di Dashboard.
    </p>
  </FormDialog>
</template>
