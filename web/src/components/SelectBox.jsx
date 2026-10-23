import { useEffect, useId, useRef, useState } from 'react'

// 앱 안에서 그리는 고르기 칸 (2026-10-23). 앱 전체를 transform: scale로 줄여 그려서(useFitScale),
// 브라우저 기본 <select>의 펼침 목록은 그 배율과 어긋나 크게 나옵니다. 그래서 목록도 앱 안에 직접 그립니다.
// options: [{ value, label }], value: 지금 값, onChange(value), ariaLabel: 화면 읽기용 이름
// placeholder: 값이 목록에 없을 때 보이는 안내 (예: "지역 고르기"), style: 바깥 칸 위치·크기, className: 화면마다 모양
// 키보드: 닫혀 있을 때 ↓·Enter·Space로 열기, 열려 있을 때 ↑↓로 옮기고 Enter로 고르기, Esc로 닫기
function SelectBox({ options, value, onChange, ariaLabel, className, style, placeholder }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const listId = `sel-${useId().replace(/:/g, '')}`
  const current = options.find((o) => o.value === value) ?? (placeholder ? null : options[0])

  // 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function openList() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function choose(option) {
    setOpen(false)
    if (option.value !== value) onChange(option.value)
  }

  function handleKeyDown(event) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openList()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} style={style} className={`selbox${open ? ' selbox--open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="selbox__btn"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={`selbox__text${current ? '' : ' selbox__text--placeholder'}`}>{current ? current.label : placeholder}</span>
        <svg className="selbox__chev" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open && (
        <ul className="selbox__list" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, i) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`selbox__opt${i === active ? ' selbox__opt--active' : ''}${option.value === value ? ' selbox__opt--on' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(option)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SelectBox
