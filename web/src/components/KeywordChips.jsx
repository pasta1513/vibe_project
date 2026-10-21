// 키워드 버튼 줄. 켜고 끌 수 있습니다. single이면 하나만 고릅니다.
// children은 줄 끝에 붙습니다. (예: 등록 창의 [+ 더하기])
function KeywordChips({ options, selected, onToggle, single = false, label, children }) {
  return (
    <div className="chips" role={single ? 'radiogroup' : 'group'} aria-label={label}>
      {options.map((option) => {
        const on = selected.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={on}
            className={`chip${on ? ' chip--selected' : ''}`}
            onClick={() => onToggle(option.id)}
          >
            {option.name}
          </button>
        )
      })}
      {children}
    </div>
  )
}

export default KeywordChips
