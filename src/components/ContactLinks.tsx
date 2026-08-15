import {
  CONTACT_KINDS,
  contactDisplay,
  contactHref,
  contactLabel,
  validContacts,
} from '../lib/contacts'
import type { Contact, ContactKind, UserProfile } from '../db/db'
import { IconChat, IconChevronRight } from './Icons'
import { t } from '../lib/i18n'

/**
 * Способы связи. Предпочтительный вынесен отдельной кнопкой: у человека
 * обычно один мессенджер, в котором он реально читает сообщения, и гадать
 * об этом собеседнику не нужно.
 */
export function ContactLinks({
  profile,
  title = 'Связаться',
  emptyHint,
}: {
  profile: Pick<UserProfile, 'contacts' | 'preferred_contact' | 'name'>
  title?: string
  emptyHint?: string
}) {
  const list = validContacts(profile.contacts)
  if (!list.length) {
    return emptyHint ? <div className="muted">{emptyHint}</div> : null
  }

  const preferred = list.find((c) => c.kind === profile.preferred_contact) ?? list[0]
  const rest = list.filter((c) => c !== preferred)

  return (
    <>
      <a
        className="btn primary block"
        href={contactHref(preferred)}
        target="_blank"
        rel="noreferrer"
      >
        <IconChat size={17} /> {title} · {contactLabel(preferred.kind)}
      </a>

      {rest.length > 0 && (
        <div className="group mt-3">
          {rest.map((c) => (
            <a
              className="group-row"
              key={`${c.kind}-${c.value}`}
              href={contactHref(c)}
              target="_blank"
              rel="noreferrer"
            >
              <span className="grow">
                <span className="title">{contactLabel(c.kind)}</span>
                <span className="sub">
                  {contactDisplay(c)}
                </span>
              </span>
              <span className="chevron">
                <IconChevronRight size={16} />
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  )
}

/** Редактор контактов: значение и отметка предпочтительного. */
export function ContactEditor({
  contacts,
  preferred,
  onChange,
}: {
  contacts: Contact[]
  preferred?: ContactKind
  onChange: (contacts: Contact[], preferred?: ContactKind) => void
}) {
  const valueOf = (kind: ContactKind) => contacts.find((c) => c.kind === kind)?.value ?? ''

  const setValue = (kind: ContactKind, value: string) => {
    const next = contacts.filter((c) => c.kind !== kind)
    if (value.trim()) next.push({ kind, value })
    // Предпочтительный сбрасывается, если его значение стёрли.
    const stillThere = next.some((c) => c.kind === preferred)
    onChange(next, stillThere ? preferred : next[0]?.kind)
  }

  const filled = CONTACT_KINDS.filter((k) => valueOf(k.kind).trim())

  return (
    <div className="stack">
      {CONTACT_KINDS.map((k) => (
        <div className="field" key={k.kind}>
          <label>
            {t(k.label)} <span className="mute-sm">· {t(k.hint)}</span>
          </label>
          <input
            className="input"
            value={valueOf(k.kind)}
            onChange={(e) => setValue(k.kind, e.target.value)}
            placeholder={
              k.kind === 'telegram' || k.kind === 'max'
                ? 'username'
                : k.kind === 'email'
                  ? 'mail@example.com'
                  : '+7 900 000-00-00'
            }
          />
        </div>
      ))}

      {filled.length > 1 && (
        <div className="field">
          <label>{t('Предпочтительный способ')}</label>
          <div className="segmented">
            {filled.map((k) => (
              <button
                key={k.kind}
                className={preferred === k.kind ? 'on' : ''}
                onClick={() => onChange(contacts, k.kind)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
