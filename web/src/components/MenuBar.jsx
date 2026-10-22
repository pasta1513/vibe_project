// 상단 메뉴바 (SCREEN-SPEC §1.1). 시안(style/html의 "포근한 옷장 앱 상세 화면" .header, .nav)을 그대로 옮겼습니다:
// 로고 "moire / 나의 작은 옷장"과 아이콘 + 글자 메뉴 다섯 개. (P-38)
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
      <path d="M12 12c-3-5-8-5-8-1 0 3 4 3 8 1zM12 12c3-5 8-5 8-1 0 3-4 3-8 1zM12 12c-3 5-8 5-8 1 0-3 4-3 8-1zM12 12c3 5 8 5 8 1 0-3-4-3-8-1z" />
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
        <path d="M12 2l2 3 3.5-1 .5 3.5 3 2-2 3 1 3.5-3.5.5-2 3-2.5-2-2.5 2-2-3L4 17l1-3.5-2-3 3-2L6.5 4l3.5 1z" />
      </>
    ),
  },
]

function MenuBar({ active, onSelect }) {
  return (
    <header className="menubar">
      <div className="menubar__brand">
        <div className="menubar__logo">
          mo<span className="menubar__logo-i">i</span>re
        </div>
        <div className="menubar__logo-sub">나의 작은 옷장</div>
      </div>
      <nav className="menubar__nav">
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
      </nav>
    </header>
  )
}

export default MenuBar
