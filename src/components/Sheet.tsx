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
  const backdrop = useRef<HTMLDivElement>(null)

  /**
   * Касание началось на фоне, а не на самой шторке.
   *
   * Закрывать по одному лишь click нельзя. Safari на айфоне, открывая
   * клавиатуру, подвигает разметку под пальцем: касание начинается на поле
   * ввода, а отпускается уже там, где оказался фон, — и шторка закрывалась
   * от попытки написать хоть букву. Смотрим, где касание началось.
   */
  const fromBackdrop = useRef(false)
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

  /*
   * Держим шторку в видимой части экрана, а не в разметочной.
   *
   * `inset: 0` и высота в vh считаются от разметочного окна, а оно при
   * появлении клавиатуры не сжимается: шторка, прижатая к низу, оказывается
   * за клавиатурой вместе с полем ввода. Человек видит только фон, и любое
   * касание закрывает шторку — написать невозможно в принципе. На Android
   * такого нет, окно там ужимается само, поэтому беда видна только на айфоне.
   *
   * visualViewport — это как раз видимая часть: подгоняем под неё фон, и
   * «прижата к низу» снова означает «над клавиатурой».
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return

    const fit = () => {
      const el = backdrop.current
      if (!el) return
      el.style.top = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
    }

    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="sheet-backdrop"
      ref={backdrop}
      onPointerDown={(e) => {
        fromBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && fromBackdrop.current) onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-grip" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}
