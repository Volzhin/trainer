import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

/**
 * Стопка открытых шторок в порядке появления. Шторки вкладываются друг в
 * друга (сканер штрихкода поверх выбора продукта), а фон под ними один на
 * всех — значит и блокировка прокрутки, и Escape относятся ко всей стопке,
 * а не к отдельному экземпляру.
 */
const stack: symbol[] = []

/** Модальная шторка в нативном стиле iOS. */
export function Sheet({ open, title, onClose, children }: Props) {
  // Закрытие держим в ссылке: обработчик вешается один раз на открытие, а
  // onClose почти везде приходит стрелкой и меняется с каждой перерисовкой
  // родителя — иначе шторка на каждый чих переставлялась бы в конец стопки.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const token = Symbol('sheet')
    stack.push(token)
    document.body.style.overflow = 'hidden'

    // Escape закрывает только верхнюю шторку: иначе одно нажатие схлопывает
    // и её, и всё, что под ней.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === token) closeRef.current()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(token)
      if (i >= 0) stack.splice(i, 1)
      // Прокрутку возвращаем, только когда закрылась последняя шторка.
      if (!stack.length) document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}
