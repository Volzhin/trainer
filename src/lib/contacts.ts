import type { Contact, ContactKind } from '../db/db'

/**
 * Ссылки в мессенджеры.
 *
 * Собственный чат проигрывает привычному: уведомления, история и звонки
 * уже есть там, где человек и так переписывается. Поэтому приложение не
 * пересылает сообщения, а ведёт прямо в диалог.
 */

export const CONTACT_KINDS: { kind: ContactKind; label: string; hint: string }[] = [
  { kind: 'telegram', label: 'Telegram', hint: 'имя пользователя без «собаки»' },
  { kind: 'max', label: 'MAX', hint: 'имя пользователя' },
  { kind: 'whatsapp', label: 'WhatsApp', hint: 'номер телефона' },
  { kind: 'phone', label: 'Телефон', hint: 'для звонка и СМС' },
  { kind: 'email', label: 'Почта', hint: 'если удобнее письмом' },
]

const LABELS = Object.fromEntries(CONTACT_KINDS.map((c) => [c.kind, c.label])) as Record<
  ContactKind,
  string
>

export const contactLabel = (kind: ContactKind) => LABELS[kind] ?? kind

/** Оставляем только цифры: номер могут ввести со скобками и дефисами. */
const digits = (v: string) => v.replace(/\D/g, '')

/** Имя пользователя: убираем «собаку» и остатки скопированной ссылки. */
const handle = (v: string) =>
  v
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(t\.me|telegram\.me|max\.ru)\/(u\/)?/i, '')
    .replace(/\/+$/, '')

/** Ссылка, открывающая диалог. Пустая строка — контакт заполнен неверно. */
export function contactHref(contact: Contact): string {
  const value = contact.value.trim()
  if (!value) return ''

  switch (contact.kind) {
    case 'telegram':
      return `https://t.me/${handle(value)}`
    case 'max':
      return `https://max.ru/${handle(value)}`
    case 'whatsapp': {
      const n = digits(value)
      return n ? `https://wa.me/${n}` : ''
    }
    case 'phone': {
      const n = digits(value)
      return n ? `tel:+${n}` : ''
    }
    case 'email':
      return `mailto:${value}`
    default:
      return ''
  }
}

/** Как показать значение: номера в читаемом виде, имена с «собакой». */
export function contactDisplay(contact: Contact): string {
  const value = contact.value.trim()
  switch (contact.kind) {
    case 'telegram':
    case 'max':
      return `@${handle(value)}`
    case 'whatsapp':
    case 'phone': {
      const n = digits(value)
      return n ? `+${n}` : value
    }
    default:
      return value
  }
}

export const validContacts = (contacts?: Contact[]): Contact[] =>
  (contacts ?? []).filter((c) => contactHref(c))
