// 상단 메뉴바 (SCREEN-SPEC §1.1). 아이콘은 시안(style/html의 .nav)의 SVG를 그대로 씁니다. (P-38)
const MENUS = [
  {
    key: 'closet',
    label: '옷장',
    icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    key: 'dressup',
    label: '새 옷 입기',
    icon: (
      <path d="M12 12c-3-6-9-6-8-1 1 3 5 2 8 1zm0 0c3-6 9-6 8-1-1 3-5 2-8 1zm0 0c-3 6-9 6-8 1 1-3 5-2 8-1zm0 0c3 6 9 6 8 1-1-3-5-2-8-1z" />
    ),
  },
  {
    key: 'diary',
    label: '코디 일기',
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
  },
  {
    key: 'favorites',
    label: '즐겨찾기',
    icon: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  },
  {
    key: 'settings',
    label: '설정',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
      </>
    ),
  },
]

function MenuBar({ active, onSelect }) {
  return (
    <nav className="menubar">
      <div className="menubar__panel">
        {MENUS.map((menu) => (
          <button
            key={menu.key}
            type="button"
            className={`menubar__item${active === menu.key ? ' menubar__item--active' : ''}`}
            aria-current={active === menu.key ? 'page' : undefined}
            onClick={() => onSelect(menu.key)}
          >
            <svg className="menubar__icon" viewBox="0 0 24 24" aria-hidden="true">
              {menu.icon}
            </svg>
            {menu.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default MenuBar
