// 상단 메뉴바 (SCREEN-SPEC §1.1)
const MENUS = [
  { key: 'closet', label: '옷장' },
  { key: 'dressup', label: '새 옷 입기' },
  { key: 'diary', label: '코디 일기' },
  { key: 'favorites', label: '즐겨찾기' },
  { key: 'settings', label: '설정' },
]

function MenuBar({ active, onSelect }) {
  return (
    <nav className="menubar">
      {MENUS.map((menu) => (
        <button
          key={menu.key}
          type="button"
          className={`menubar__item${active === menu.key ? ' menubar__item--active' : ''}`}
          aria-current={active === menu.key ? 'page' : undefined}
          onClick={() => onSelect(menu.key)}
        >
          {menu.label}
        </button>
      ))}
    </nav>
  )
}

export default MenuBar
