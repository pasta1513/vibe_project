import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, CATEGORY_LABEL, KEYWORD_ROWS, formatDate } from '../labels.js'
import AlertDialog from './AlertDialog.jsx'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'
import WordAdder, { isBlankName } from './WordAdder.jsx'

// 설정 (SCREEN-SPEC §9)

// 첫 실행의 마네킹 고르기(MannequinPicker)와 같은 고르기 줄입니다.
const MANNEQUIN_ROWS = [
  { key: 'gender', label: '성별', options: [['female', '여성'], ['male', '남성']] },
  { key: 'height', label: '키', options: [['short', '작은'], ['medium', '보통'], ['tall', '큰']] },
  { key: 'body', label: '체형', options: [['slim', '마른'], ['medium', '보통'], ['chubby', '통통한']] },
]

// 종류 단어의 맞는 성별. 버튼 세 개 중 하나를 고릅니다. (D-005, 사람이 정함 2026-10-21)
const TYPE_GENDERS = [
  ['female', '여성'],
  ['male', '남성'],
  ['both', '둘 다'],
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

// 단어 하나: 이름, ✎ 이름 고치기, ✕ 지우기. 종류 단어는 성별 버튼 세 개가 함께 보입니다.
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
      <li className="word word--editing">
        <form className="word-form" onSubmit={save}>
          <input
            className="text-input"
            value={name}
            placeholder="이름을 입력해 주세요"
            aria-label={`'${word.name}'의 새 이름`}
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={isBlankName(name) || busy}>
            저장
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setEditing(false)
              setName(word.name)
            }}
          >
            취소
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className="word">
      <span className="word__name">{word.name}</span>
      {word.gender && (
        <span className="word__genders" role="radiogroup" aria-label={`'${word.name}'의 맞는 성별`}>
          {TYPE_GENDERS.map(([code, label]) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={word.gender === code}
              className={`chip chip--small${word.gender === code ? ' chip--selected' : ''}`}
              disabled={busy}
              onClick={() => word.gender !== code && onGender(word, code)}
            >
              {label}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className="icon-btn"
        aria-label={`'${word.name}' 이름 고치기`}
        disabled={busy}
        onClick={() => {
          setName(word.name)
          setEditing(true)
        }}
      >
        ✎
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`'${word.name}' 지우기`}
        disabled={busy}
        onClick={() => setConfirmDelete(true)}
      >
        ✕
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
    <ul className="word-list">
      {words.map((word) => (
        <WordItem key={word.id} word={word} {...handlers} />
      ))}
      <li className="word word--add">{adder}</li>
    </ul>
  )
}

function SettingsScreen({ mannequin, onMannequinSaved, onRegionSaved, showToast }) {
  const [settings, setSettings] = useState(null)
  const [keywords, setKeywords] = useState(null)
  const [tags, setTags] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('color')
  const [region, setRegion] = useState('')
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

  async function chooseShape(key, value) {
    if (mannequin[key] === value) return
    setSavingShape(true)
    setShapeError(null)
    const res = await api.saveMannequin({ ...mannequin, [key]: value })
    setSavingShape(false)
    if (res.result === 'ok') onMannequinSaved(res.data)
    else setShapeError(res.error.message)
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
        onAdded={(word) => replaceWords(kind, (list) => [...list, word])}
      />
    )
  }

  if (loadError) {
    return (
      <section className="settings" aria-label="설정">
        <ErrorLine message={loadError} onRetry={load} />
      </section>
    )
  }
  if (!settings) return <section className="settings" aria-label="설정" />

  return (
    <section className="settings" aria-label="설정">
      <div className="settings__row">
        <h3 className="settings__label">마네킹 모양</h3>
        <div className="settings__content settings__mannequin">
          <div className="picker__rows">
            {MANNEQUIN_ROWS.map((row) => (
              <div key={row.key} className="picker__row" role="radiogroup" aria-label={row.label}>
                <span className="picker__label">{row.label}</span>
                {row.options.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mannequin[row.key] === value}
                    className={`chip${mannequin[row.key] === value ? ' chip--selected' : ''}`}
                    disabled={savingShape}
                    onClick={() => chooseShape(row.key, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
            {shapeError && <ErrorLine message={shapeError} />}
          </div>
          <Mannequin className="settings__preview" {...mannequin} title="지금 마네킹 모양" />
        </div>
      </div>

      <div className="settings__row">
        <h3 className="settings__label">내 지역</h3>
        <div className="settings__content settings__region">
          <span className={settings.home_region ? '' : 'sub-text'}>
            {settings.home_region ?? '저장한 지역 없음'}
          </span>
          <select
            className="text-input"
            aria-label="내 지역 고르기"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option value="" disabled>
              지역 고르기
            </option>
            {settings.regions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Button
            disabled={!region || region === settings.home_region || savingRegion}
            onClick={saveRegion}
          >
            {savingRegion ? '저장하는 중…' : '저장'}
          </Button>
          {regionError && <ErrorLine message={regionError} />}
        </div>
      </div>

      <div className="settings__row">
        <h3 className="settings__label">옷 키워드</h3>
        <div className="settings__content">
          <div className="tabs" role="tablist" aria-label="키워드 종류">
            {KEYWORD_TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                role="tab"
                aria-selected={tab === t.kind}
                className={`tab${tab === t.kind ? ' tab--active' : ''}`}
                onClick={() => setTab(t.kind)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'category' && (
            <>
              <ul className="word-list">
                {CATEGORIES.map((c) => (
                  <li key={c.code} className="word">
                    <span className="word__name">{c.label}</span>
                  </li>
                ))}
              </ul>
              <p className="sub-text">구분은 고정이라 고치거나 지울 수 없어요.</p>
            </>
          )}
          {tab === 'type' &&
            CATEGORIES.map((c) => (
              <div key={c.code} className="settings__group">
                <h4 className="settings__group-title">{c.label}</h4>
                <WordList
                  words={keywords.type.filter((w) => w.category === c.code)}
                  adder={adder('type', c.code)}
                  {...makeHandlers('type')}
                />
              </div>
            ))}
          {tab !== 'category' && tab !== 'type' && (
            <WordList words={keywords[tab]} adder={adder(tab)} {...makeHandlers(tab)} />
          )}
        </div>
      </div>

      <div className="settings__row">
        <h3 className="settings__label">스타일 태그</h3>
        <div className="settings__content">
          <WordList words={tags} adder={adder('tag')} {...makeHandlers('tag')} />
        </div>
      </div>

      {actionError && <ErrorLine message={actionError} />}
      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
    </section>
  )
}

export default SettingsScreen
