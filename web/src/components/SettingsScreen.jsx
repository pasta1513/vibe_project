import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import settingsBg from '../assets/settings/settings-bg.png'
import { CATEGORIES, CATEGORY_LABEL, KEYWORD_ROWS, formatDate } from '../labels.js'
import '../styles/settings.css'
import AlertDialog from './AlertDialog.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'
import SelectBox from './SelectBox.jsx'
import WordAdder, { isBlankName } from './WordAdder.jsx'

// 설정 (SCREEN-SPEC §9). 시안 style/html 11의 틀(큰 패널과 왼쪽 메뉴)을 옮기고,
// 지역·키워드·태그 쪽은 11_1의 검색칸과 둥근 단추 모양을 씁니다. (P-38, 사람이 정함 2026-10-22)
// 시안의 "앱 설정", "데이터 관리", 닉네임, 최근 날씨는 앱에 없어 넣지 않았습니다.

const PAGES = [
  { key: 'mannequin', label: '마네킹 설정', title: '마네킹 설정', sub: '나와 닮은 마네킹을 설정해 보세요.' },
  { key: 'region', label: '지역 설정', title: '지역 설정', sub: '날씨에 맞는 코디를 추천해요.' },
  { key: 'keywords', label: '키워드 관리', title: '키워드 관리', sub: '옷 등록 시 사용하는 키워드를 관리해요.' },
  { key: 'tags', label: '스타일 태그 관리', title: '스타일 태그 관리', sub: '자주 사용하는 스타일 태그를 관리해요.' },
]

// 왼쪽 메뉴 그림 (시안 11의 선 그림)
const PAGE_ICONS = {
  mannequin: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  region: (
    <>
      <path d="M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  keywords: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  tags: <path d="M9 3L7 21M17 3l-2 18M4 8h17M3 16h17" />,
}

// 마네킹 고르기 칸. 시안 11은 키 5칸, 체형 4칸이지만 앱의 모양(성별 2, 키 3, 체형 3)에 맞춥니다.
// 칸마다 앱 마네킹을 그립니다 (사람이 정함, 2026-10-22). left, width: 패널 안 위치
const MANNEQUIN_GROUPS = [
  {
    key: 'gender',
    label: '성별 선택',
    left: 289,
    tileWidth: 70,
    options: [['female', '여성'], ['male', '남성']],
  },
  {
    key: 'height',
    label: '키 선택',
    left: 463,
    tileWidth: 92,
    options: [['short', '작은 편'], ['medium', '보통'], ['tall', '큰 편']],
  },
  {
    key: 'body',
    label: '체형 선택',
    left: 784,
    tileWidth: 62,
    options: [['slim', '마른'], ['medium', '보통'], ['chubby', '통통한']],
  },
]

// 종류 단어의 맞는 성별. 버튼 세 개 중 하나를 고릅니다. (D-005, 사람이 정함 2026-10-21)
// 둥근 단추 안에 들어가도록 한 글자로 줄여 보이고, 읽어 주는 이름은 그대로 둡니다. (P-38)
const TYPE_GENDERS = [
  ['female', '여', '여성'],
  ['male', '남', '남성'],
  ['both', '둘', '둘 다'],
]

// 구분 탭은 보기만 합니다. 구분은 고정이라 고치거나 지울 수 없습니다. (PRD §4)
const KEYWORD_TABS = [{ kind: 'category', label: '구분' }, ...KEYWORD_ROWS]

// 지울 수 없음 안내: 어떤 옷이나 기록이 쓰는지 적습니다. (SCREEN-SPEC §2.6)
function InUseMessage({ message, usedBy }) {
  return (
    <>
      {message}
      {usedBy.clothes.length > 0 && (
        <span className="in-use__row">
          <span className="in-use__label">옷장</span>
          {usedBy.clothes.map((c) => (
            <img
              key={c.id}
              className="in-use__thumb"
              src={c.image_url}
              alt={`${CATEGORY_LABEL[c.category]} ${c.id}`}
              title={CATEGORY_LABEL[c.category]}
            />
          ))}
        </span>
      )}
      {usedBy.diary.length > 0 && (
        <span className="in-use__row">
          <span className="in-use__label">코디 일기</span>
          {usedBy.diary.map((d) => formatDate(d.date)).join(', ')}
        </span>
      )}
      {usedBy.favorites.length > 0 && (
        <span className="in-use__row">
          <span className="in-use__label">즐겨찾기</span>
          {usedBy.favorites.map((f) => `${f.number}번째 코디`).join(', ')}
        </span>
      )}
    </>
  )
}

// 단어 하나: 시안 11_1의 "#이름 ×" 둥근 단추. 이름을 누르면 그 자리에서 고치고, ×는 지우기 (확인 질문).
// 종류 단어는 단추 안에 작은 성별 버튼 세 개가 함께 보입니다. (사람이 정함, 2026-10-22)
function WordItem({ word, onRename, onDelete, onGender }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(word.name)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(event) {
    event.preventDefault()
    if (isBlankName(name) || busy) return
    setBusy(true)
    const done = await onRename(word, name)
    setBusy(false)
    if (done) setEditing(false)
  }

  // 지우기 확인 질문에서 [지우기]를 눌렀을 때 (SCREEN-SPEC §2.6)
  async function remove() {
    setConfirmDelete(false)
    setBusy(true)
    await onDelete(word)
    setBusy(false)
  }

  if (editing) {
    return (
      <li className="st-chip st-chip--editing">
        <form className="st-chip__form" onSubmit={save}>
          <input
            value={name}
            placeholder="이름을 입력해 주세요"
            aria-label={`'${word.name}'의 새 이름`}
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="st-chip__ok" disabled={isBlankName(name) || busy}>
            저장
          </button>
          <button
            type="button"
            className="st-chip__cancel"
            disabled={busy}
            onClick={() => {
              setEditing(false)
              setName(word.name)
            }}
          >
            취소
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className="st-chip">
      <button
        type="button"
        className="st-chip__name"
        title="눌러서 이름 고치기"
        aria-label={`'${word.name}' 이름 고치기`}
        disabled={busy}
        onClick={() => {
          setName(word.name)
          setEditing(true)
        }}
      >
        #{word.name}
      </button>
      {word.gender && (
        <span className="st-chip__genders" role="radiogroup" aria-label={`'${word.name}'의 맞는 성별`}>
          {TYPE_GENDERS.map(([code, short, label]) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={word.gender === code}
              aria-label={label}
              title={label}
              className={word.gender === code ? 'on' : ''}
              disabled={busy}
              onClick={() => word.gender !== code && onGender(word, code)}
            >
              {short}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className="st-chip__x"
        aria-label={`'${word.name}' 지우기`}
        disabled={busy}
        onClick={() => setConfirmDelete(true)}
      >
        ×
      </button>
      {confirmDelete && (
        <ConfirmDialog
          message="정말 지울까요?"
          confirmLabel="지우기"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </li>
  )
}

function WordList({ words, adder, ...handlers }) {
  return (
    <ul className="st-chips">
      {words.map((word) => (
        <WordItem key={word.id} word={word} {...handlers} />
      ))}
      <li className="st-chips__add">{adder}</li>
    </ul>
  )
}

// initialPage: 처음 보일 쪽 ('region' 등). 없으면 마네킹 설정
function SettingsScreen({ mannequin, initialPage, onMannequinSaved, onRegionSaved, showToast }) {
  const [settings, setSettings] = useState(null)
  const [keywords, setKeywords] = useState(null)
  const [tags, setTags] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [page, setPage] = useState(initialPage ?? 'mannequin')
  const [tab, setTab] = useState('color')
  const [region, setRegion] = useState('')
  // 고르는 중인 마네킹 모양. [설정 완료]를 눌러야 저장합니다. (사람이 정함, 2026-10-22)
  const [draft, setDraft] = useState(mannequin)
  const [savingShape, setSavingShape] = useState(false)
  const [shapeError, setShapeError] = useState(null)
  const [savingRegion, setSavingRegion] = useState(false)
  const [regionError, setRegionError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [alert, setAlert] = useState(null)

  // 메뉴 "설정": 요청 세 개를 한꺼번에 보냅니다. (API-SPEC §12)
  const load = useCallback(async () => {
    const all = await Promise.all([api.getSettings(), api.getKeywords(), api.getTags()])
    const failed = all.find((r) => r.result !== 'ok')
    if (failed) {
      setLoadError(failed.error.message)
      return
    }
    const [settingsRes, keywordsRes, tagsRes] = all
    setLoadError(null)
    setSettings(settingsRes.data)
    setRegion(settingsRes.data.home_region ?? '')
    setKeywords(keywordsRes.data)
    setTags(tagsRes.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shapeChanged = MANNEQUIN_GROUPS.some((g) => draft[g.key] !== mannequin[g.key])

  async function saveShape() {
    setSavingShape(true)
    setShapeError(null)
    const res = await api.saveMannequin(draft)
    setSavingShape(false)
    if (res.result === 'ok') {
      onMannequinSaved(res.data)
      showToast('저장되었습니다.')
    } else {
      setShapeError(res.error.message)
    }
  }

  async function saveRegion() {
    setSavingRegion(true)
    setRegionError(null)
    const res = await api.saveRegion(region)
    setSavingRegion(false)
    if (res.result === 'ok') {
      setSettings((prev) => ({ ...prev, home_region: res.data.home_region }))
      onRegionSaved?.(res.data.home_region)
      showToast('저장되었습니다.')
    } else {
      setRegionError(res.error.message)
    }
  }

  // 키워드와 태그의 목록 바꾸기. kind가 'tag'이면 태그 목록입니다.
  function replaceWords(kind, update) {
    if (kind === 'tag') setTags((prev) => update(prev))
    else setKeywords((prev) => ({ ...prev, [kind]: update(prev[kind]) }))
  }

  function makeHandlers(kind) {
    const isTag = kind === 'tag'
    return {
      onRename: async (word, name) => {
        setActionError(null)
        const res = isTag ? await api.renameTag(word.id, name) : await api.renameKeyword(word.id, name)
        if (res.result === 'ok') {
          replaceWords(kind, (list) => list.map((w) => (w.id === word.id ? res.data : w)))
          return true
        }
        if (res.error.kind === 'same_name') setAlert(res.error.message)
        else setActionError(res.error.message)
        return false
      },
      onDelete: async (word) => {
        setActionError(null)
        const res = isTag ? await api.deleteTag(word.id) : await api.deleteKeyword(word.id)
        if (res.result === 'ok') {
          replaceWords(kind, (list) => list.filter((w) => w.id !== word.id))
        } else if (res.error.kind === 'in_use') {
          setAlert(<InUseMessage message={res.error.message} usedBy={res.error.used_by} />)
        } else {
          setActionError(res.error.message)
        }
      },
      onGender: async (word, gender) => {
        setActionError(null)
        const res = await api.setKeywordGender(word.id, gender)
        if (res.result === 'ok') {
          replaceWords(kind, (list) => list.map((w) => (w.id === word.id ? res.data : w)))
        } else {
          setActionError(res.error.message)
        }
      },
    }
  }

  function adder(kind, category) {
    return (
      <WordAdder
        kind={kind}
        category={category}
        showToast={showToast}
        label={kind === 'tag' ? '＋ 태그 추가하기' : '＋ 키워드 추가하기'}
        onAdded={(word) => replaceWords(kind, (list) => [...list, word])}
      />
    )
  }

  const current = PAGES.find((p) => p.key === page)

  return (
    <section className="st" aria-label="설정" style={{ '--src': `url(${settingsBg})` }}>
      <div className="st-main">
        {/* 왼쪽 메뉴 (시안 11 .side) */}
        <nav className="st-side" aria-label="설정 메뉴">
          {PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              className={page === p.key ? 'selected' : ''}
              aria-current={page === p.key ? 'page' : undefined}
              onClick={() => setPage(p.key)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {PAGE_ICONS[p.key]}
              </svg>
              {p.label}
            </button>
          ))}
        </nav>

        <h2 className="st-title">{current.title}</h2>
        <p className="st-sub">{current.sub}</p>
        <hr className={`st-hr${page === 'mannequin' ? ' st-hr--short' : ''}`} />

        {loadError && (
          <div className="st-body">
            <ErrorLine message={loadError} onRetry={load} />
          </div>
        )}

        {/* 마네킹 설정 (시안 11) */}
        {page === 'mannequin' && (
          <>
            {MANNEQUIN_GROUPS.map((g, gi) => (
              <div key={g.key}>
                <h4 className="st-group" style={{ left: g.left }}>
                  {g.label}
                </h4>
                {gi > 0 && <div className="st-vline" style={{ left: g.left - 17 }} />}
                <div className="st-tiles" role="radiogroup" aria-label={g.label} style={{ left: g.left }}>
                  {g.options.map(([value, label]) => {
                    const on = draft[g.key] === value
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`st-tile${on ? ' selected' : ''}`}
                        style={{ width: g.tileWidth }}
                        disabled={savingShape}
                        onClick={() => setDraft((prev) => ({ ...prev, [g.key]: value }))}
                      >
                        <Mannequin
                          className="st-tile__mannequin"
                          {...draft}
                          {...{ [g.key]: value }}
                          title={label}
                        />
                        <span className="st-tile__label">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {shapeError && (
              <div className="st-shape-error">
                <ErrorLine message={shapeError} />
              </div>
            )}
            <div className="st-preview">
              <Mannequin className="st-preview__mannequin" {...draft} title="고른 마네킹 모양" />
            </div>
            <button
              type="button"
              className="st-done"
              disabled={!shapeChanged || savingShape}
              onClick={saveShape}
            >
              {savingShape ? '저장하는 중…' : shapeChanged ? '설정 완료' : '저장된 모양이에요'}
            </button>
          </>
        )}

        {/* 지역 설정 (시안 11_1 .search 모양) */}
        {page === 'region' && settings && (
          <div className="st-body">
            <p className="st-region__now">
              저장한 지역 <b>{settings.home_region ?? '없음'}</b>
            </p>
            <div className="st-region">
              <div className="st-search">
                <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" fill="#f0574b" />
                  <circle cx="12" cy="10" r="2.6" fill="#fff" />
                </svg>
                <SelectBox
                  ariaLabel="내 지역 고르기"
                  placeholder="지역 고르기"
                  value={region}
                  onChange={setRegion}
                  options={settings.regions.map((name) => ({ value: name, label: name }))}
                />
              </div>
              <button
                type="button"
                className="st-save"
                disabled={!region || region === settings.home_region || savingRegion}
                onClick={saveRegion}
              >
                {savingRegion ? '저장하는 중…' : '저장'}
              </button>
            </div>
            <p className="st-note">시·도 17곳에서 골라요. 새 옷 입기에서 지역을 따로 바꾸지 않으면 이 지역의 날씨를 써요.</p>
            {regionError && <ErrorLine message={regionError} />}
          </div>
        )}

        {/* 키워드 관리 (시안 11_1 .pill 탭과 .tags) */}
        {page === 'keywords' && keywords && (
          <div className="st-body">
            <div className="st-tabs" role="tablist" aria-label="키워드 종류">
              {KEYWORD_TABS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.kind}
                  className={tab === t.kind ? 'selected' : ''}
                  onClick={() => setTab(t.kind)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="st-box">
              {tab === 'category' && (
                <>
                  <ul className="st-chips">
                    {CATEGORIES.map((c) => (
                      <li key={c.code} className="st-chip st-chip--fixed">
                        <span className="st-chip__name">#{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="st-note">구분은 고정이라 고치거나 지울 수 없어요.</p>
                </>
              )}
              {tab === 'type' && (
                <>
                  <p className="st-note">여·남·둘: 그 종류가 맞는 성별 (여성, 남성, 둘 다). 누르면 바로 저장돼요.</p>
                  {CATEGORIES.map((c) => (
                    <div key={c.code} className="st-cat">
                      <h4>{c.label}</h4>
                      <WordList
                        words={keywords.type.filter((w) => w.category === c.code)}
                        adder={adder('type', c.code)}
                        {...makeHandlers('type')}
                      />
                    </div>
                  ))}
                </>
              )}
              {tab !== 'category' && tab !== 'type' && (
                <WordList words={keywords[tab]} adder={adder(tab)} {...makeHandlers(tab)} />
              )}
            </div>
            {actionError && <ErrorLine message={actionError} />}
          </div>
        )}

        {/* 스타일 태그 관리 (시안 11_1 .tags) */}
        {page === 'tags' && tags && (
          <div className="st-body">
            <div className="st-box st-box--tall">
              <WordList words={tags} adder={adder('tag')} {...makeHandlers('tag')} />
            </div>
            {actionError && <ErrorLine message={actionError} />}
          </div>
        )}
      </div>

      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
    </section>
  )
}

export default SettingsScreen
