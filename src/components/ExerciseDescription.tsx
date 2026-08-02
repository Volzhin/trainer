/**
 * Разметка техники выполнения. В источнике это плоский список строк, среди
 * которых встречаются заголовки секций («Исходное положение:», «Выполнение:»)
 * и подписанные пункты («Фокус: …», «Акцент: …»). Плоским текстом это читается
 * как сплошная стена, поэтому разбираем на секции и пункты.
 */

type Item = { label?: string; text: string }
type Section = { title?: string; items: Item[] }

/** Строка вида «Заголовок:» без текста — начало новой секции. */
const SECTION_RE = /^([А-ЯЁA-Z][^:]{2,48}):\s*$/
/** Строка вида «Фокус: держим лопатки» — пункт с подписью. */
const LABELLED_RE = /^([А-ЯЁA-Z][^:]{2,44}):\s*(\S.*)$/

export function parseDescription(text: string): Section[] {
  const sections: Section[] = []
  let current: Section = { items: [] }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const asSection = line.match(SECTION_RE)
    if (asSection) {
      if (current.items.length || current.title) sections.push(current)
      current = { title: asSection[1], items: [] }
      continue
    }

    const labelled = line.match(LABELLED_RE)
    if (labelled) {
      current.items.push({ label: labelled[1], text: labelled[2] })
      continue
    }

    current.items.push({ text: line })
  }

  if (current.items.length || current.title) sections.push(current)
  return sections
}

export function ExerciseDescription({ text }: { text: string }) {
  const sections = parseDescription(text)
  if (!sections.length) return null

  return (
    <div className="stack" style={{ gap: 16 }}>
      {sections.map((s, si) => (
        <div key={si}>
          {s.title && (
            <div
              className="mute-sm"
              style={{
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {s.title}
            </div>
          )}
          <ol className="steps-list">
            {s.items.map((it, i) => (
              <li key={i}>
                {/* Один узел на ячейку сетки: иначе подпись и текст становятся
                    отдельными grid-элементами и текст уезжает под номер. */}
                <span>
                  {it.label && <b>{it.label}. </b>}
                  {it.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
