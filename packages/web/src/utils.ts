import i18n from './i18n.ts'

export function formatStatus(status: string): string {
  return i18n.t('status.' + status)
}

export function formatStep(step: string): string {
  return i18n.t('step.' + step)
}
