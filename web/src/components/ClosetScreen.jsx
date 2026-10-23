import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import closetBg from '../assets/closet/closet-bg.png'
import { CATEGORIES, subjectParticle } from '../labels.js'
import ClothingDetailDialog from './ClothingDetailDialog.jsx'
import ClothingRegisterDialog from './ClothingRegisterDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import { GarmentIllustration } from './Mannequin.jsx'

// 옷장 (옷 관리, SCREEN-SPEC §6.1). 시안 style/html의 "포근한 옷장 앱 상세 화면"을 그대로 옮겼습니다:
// 시안 PNG를 배경으로, 왼쪽에 구분 목록(전체와 구분마다 개수), 오른쪽에 옷 카드. 첫 카드는 07_2의 "+ 옷 추가하기". (P-38)
// 시안의 검색칸, 가방·악세서리, 최근 삭제한 의상, 하트와 ⋮는 앱에 기능이 없어 넣지 않았습니다 (사람이 정함, 2026-10-22).

// 시안의 순서: 전체, 상의, 하의, 원피스, 아우터, 신발
const CATEGORY_ORDER = ['top', 'bottom', 'dress', 'outer', 'shoes']
const CATEGORY_ICONS = {
  all: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  top: <path d="M9 3c0 2 1.3 3 3 3s3-1 3-3l6 3-2 5h-3v10H8V11H5L3 6z" />,
  bottom: <path d="M6 3h12l1 18h-5l-2-11-2 11H5zM6 7h12" />,
  dress: <path d="M9 3h6v4l-1 3 5 11H5l5-11-1-3z" />,
  outer: <path d="M8 3l4 3 4-3 5 4v13h-4V10M7 10v10H3V7zM12 6v15M9 21h6" />,
  shoes: <path d="M3 15c0-4 2-7 4-7 1 2 3 3 6 3l7 3c1 .5 1 3 0 3H4c-.6 0-1-.5-1-2zM3 18h18" />,
}

const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]))

function ClosetScreen({ mannequin, outfitTable, showToast }) {
  const [clothes, setClothes] = useState(null)
  const [keywords, setKeywords] = useState(null)
  // 카드의 "#키워드": 옷 목록에는 키워드가 없어 옷마다 상세를 받아 채웁니다.
  const [tags, setTags] = useState({})
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [registering, setRegistering] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const applyLoaded = useCallback(([clothesRes, keywordsRes]) => {
    const failed = [clothesRes, keywordsRes].find((r) => r.result !== 'ok')
    if (failed) {
      setError(failed.error.message)
      return
    }
    setError(null)
    setClothes(clothesRes.data)
    setKeywords(keywordsRes.data)
    const ids = CATEGORY_ORDER.flatMap((c) => clothesRes.data[c].map((item) => item.id))
    Promise.all(ids.map((id) => api.getClothing(id))).then((results) => {
      const next = {}
      results.forEach((res, i) => {
        if (res.result === 'ok') {
          const kw = res.data.keywords
          next[ids[i]] = [...kw.color, ...kw.type].map((k) => k.name)
        }
      })
      setTags(next)
    })
  }, [])

  const load = useCallback(
    () => Promise.all([api.getClothes(), api.getKeywords()]).then(applyLoaded),
    [applyLoaded],
  )

  useEffect(() => {
    load()
  }, [load])

  function handleRegistered() {
    setRegistering(false)
    load()
    showToast('등록되었습니다.')
  }

  function handleDeleted() {
    setDetailId(null)
    load()
    showToast('지웠습니다.')
  }

  const count = (code) => (clothes ? clothes[code].length : 0)
  const total = CATEGORY_ORDER.reduce((n, c) => n + count(c), 0)
  const shown = clothes
    ? (filter === 'all' ? CATEGORY_ORDER : [filter]).flatMap((c) => clothes[c].map((item) => ({ ...item, category: c })))
    : []
  const filters = [{ code: 'all', label: '전체', n: total }, ...CATEGORY_ORDER.map((c) => ({ code: c, label: LABEL[c], n: count(c) }))]

  return (
    <section className="closet-screen" aria-label="옷장" style={{ '--src': `url(${closetBg})` }}>
      {/* 옷 등록은 시안 07_4처럼 옷장 목록 자리에 넓게 뜹니다. (P-38) */}
      {!registering && (
        <div className={`cl${detailId !== null ? ' cl--dim' : ''}`}>
          <svg className="cl__hanger" viewBox="0 0 46 40" aria-hidden="true">
            <path d="M23 12a4 4 0 1 1 4-4c0 3-4 3-4 7L4 28c-2 1.5-1 4 1.5 4h35c2.5 0 3.5-2.5 1.5-4L23 15" />
          </svg>
          <h2 className="cl__title">내 옷장</h2>
          <p className="cl__count">{clothes ? `총 ${total}개의 의상이 있어요.` : '옷장을 여는 중…'}</p>
          <div className="cl__sep" aria-hidden="true" />

          <nav className="cl__cats" aria-label="구분">
            {filters.map((f) => (
              <button
                key={f.code}
                type="button"
                className={`cl__cat${filter === f.code ? ' cl__cat--on' : ''}`}
                aria-pressed={filter === f.code}
                onClick={() => setFilter(f.code)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {CATEGORY_ICONS[f.code]}
                </svg>
                {f.label}
                <span className="cl__cat-n">{f.n}</span>
              </button>
            ))}
          </nav>

          <div className="cl__grid-area">
            {error && <ErrorLine message={error} onRetry={load} />}
            {clothes && (
              <div className="cl__grid">
                <button type="button" className="cl__add" onClick={() => setRegistering(true)}>
                  <span className="cl__add-plus" aria-hidden="true">
                    +
                  </span>
                  옷 추가하기
                </button>
                {shown.length === 0 && (
                  <p className="cl__empty">
                    {filter === 'all'
                      ? '아직 등록한 옷이 없어요.'
                      : `아직 등록한 ${LABEL[filter]}${subjectParticle(LABEL[filter])} 없어요.`}
                  </p>
                )}
                {shown.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`cl__card${detailId === item.id ? ' cl__card--sel' : ''}`}
                    onClick={() => setDetailId(item.id)}
                    aria-label={`${LABEL[item.category]} ${(tags[item.id] ?? []).join(' ')}`}
                  >
                    {/* 옷만 그린 2D 일러스트 (사람이 정함, 2026-10-23) */}
                    <GarmentIllustration className="cl__card-pic" item={item} mannequin={mannequin} title="" />
                    <span className="cl__tags">
                      {(tags[item.id] ?? []).slice(0, 2).map((t) => (
                        <b key={t}>#{t}</b>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {registering && keywords && (
        <ClothingRegisterDialog
          keywords={keywords}
          mannequin={mannequin}
          outfitTable={outfitTable}
          onClose={() => {
            // 등록 창에서 [+ 더하기]로 더한 단어가 옷 상세에도 보이도록 목록을 다시 받습니다.
            setRegistering(false)
            load()
          }}
          onRegistered={handleRegistered}
        />
      )}
      {detailId !== null && keywords && (
        <ClothingDetailDialog
          clothingId={detailId}
          keywords={keywords}
          mannequin={mannequin}
          outfitTable={outfitTable}
          onClose={() => setDetailId(null)}
          onDeleted={handleDeleted}
          onSaved={() => {
            showToast('저장되었습니다.')
            load()
          }}
        />
      )}
    </section>
  )
}

export default ClosetScreen
