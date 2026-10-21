import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, SLOT_LABEL, isoDate, subjectParticle } from '../labels.js'
import AlertDialog from './AlertDialog.jsx'
import Button from './Button.jsx'
import ConditionBar from './ConditionBar.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'
import ScoreCard from './ScoreCard.jsx'

// 새 옷 입기 (SCREEN-SPEC §5): 옷 고르는 단계(5.2)와 점수 확인 단계(5.4)
// 편집 중인 코디는 화면만 들고 있고, 새로고침하면 사라집니다. (ARCHITECTURE §2.1)

const EMPTY_OUTFIT = { top: null, bottom: null, dress: null, shoes: null, outer: null }
const NO_CLOTHES_MS = 3000
// 오늘 포함 5일 (PRD §5)
const DATES = [0, 1, 2, 3, 4].map((offset) => isoDate(offset))

// 빈 칸 경고창에 적을 칸. 아우터 "입지 않음"은 채운 것으로 봅니다. (PRD §6 흐름 2)
function missingSlots(outfit) {
  const missing = []
  if (!outfit.dress) {
    if (!outfit.top) missing.push('top')
    if (!outfit.bottom) missing.push('bottom')
  }
  if (!outfit.shoes) missing.push('shoes')
  if (!outfit.outer) missing.push('outer')
  return missing
}

function DressUpScreen({ mannequin, regions, onNoClothes }) {
  const [clothes, setClothes] = useState(null)
  const [tags, setTags] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [noClothes, setNoClothes] = useState(false)

  const [date, setDate] = useState(DATES[0])
  const [chosenRegion, setChosenRegion] = useState(null) // 사용자가 조건 띠에서 바꾼 지역
  const [tagId, setTagId] = useState(null)
  const [weather, setWeather] = useState({ data: null, loading: true, error: null })

  const [outfit, setOutfit] = useState(EMPTY_OUTFIT)
  const [stage, setStage] = useState('pick') // pick: 옷 고르는 단계, score: 점수 확인 단계
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [result, setResult] = useState(null)
  const [alert, setAlert] = useState(null)

  // 가장 마지막에 보낸 날씨 요청만 반영합니다. (날짜를 빠르게 바꿀 때)
  const weatherSeq = useRef(0)
  const loadWeather = useCallback(async (day, region) => {
    const seq = ++weatherSeq.current
    setWeather((prev) => ({ ...prev, loading: true, error: null }))
    const res = await api.getWeather(day, region)
    if (seq !== weatherSeq.current) return
    if (res.result === 'ok') setWeather({ data: res.data, loading: false, error: null })
    else setWeather({ data: null, loading: false, error: res.error.message })
  }, [])

  // 메뉴 "새 옷 입기": 옷 목록, 태그 목록, 날씨를 한꺼번에 받습니다. (API-SPEC §12)
  // 날씨를 받지 못해도 옷 목록은 보입니다. (API-SPEC §5.1)
  const load = useCallback(async () => {
    setLoadError(null)
    loadWeather(DATES[0], null)
    const [clothesRes, tagsRes] = await Promise.all([api.getClothes(), api.getTags()])
    const failed = [clothesRes, tagsRes].find((r) => r.result !== 'ok')
    if (failed) {
      setLoadError(failed.error.message)
      return
    }
    const total = CATEGORIES.reduce((n, c) => n + clothesRes.data[c.code].length, 0)
    if (total === 0) {
      setNoClothes(true)
      return
    }
    setClothes(clothesRes.data)
    setTags(tagsRes.data)
  }, [loadWeather])

  useEffect(() => {
    load()
  }, [load])

  // 옷이 한 벌도 없으면 경고창을 버튼 없이 3초 보인 뒤 옷장으로 옮겨 갑니다. (SCREEN-SPEC §2.6)
  useEffect(() => {
    if (!noClothes) return undefined
    const timer = setTimeout(onNoClothes, NO_CLOTHES_MS)
    return () => clearTimeout(timer)
  }, [noClothes, onNoClothes])

  function changeDate(day) {
    setDate(day)
    loadWeather(day, chosenRegion)
  }

  function changeRegion(region) {
    setChosenRegion(region)
    loadWeather(date, region)
  }

  // 옷을 입히거나 바꿉니다. 원피스를 고르면 상의·하의가 빠지고, 상의나 하의를 고르면 원피스가 빠집니다.
  // 이미 입힌 옷을 다시 누르면 벗깁니다.
  function wear(slot, id) {
    setOutfit((prev) => {
      if (prev[slot] === id) return { ...prev, [slot]: null }
      if (slot === 'dress') return { ...prev, dress: id, top: null, bottom: null }
      if (slot === 'top' || slot === 'bottom') return { ...prev, [slot]: id, dress: null }
      return { ...prev, [slot]: id }
    })
  }

  async function checkScore() {
    const missing = missingSlots(outfit)
    if (missing.length > 0) {
      const names = missing.map((slot) => SLOT_LABEL[slot])
      const last = names[names.length - 1]
      setAlert(`${names.join(', ')}${subjectParticle(last)} 선택되지 않았어요.`)
      return
    }
    setScoring(true)
    setScoreError(null)
    const res = await api.score({
      outfit: { ...outfit, outer: outfit.outer === 'none' ? null : outfit.outer },
      date,
      region: chosenRegion,
      tag_id: tagId,
    })
    setScoring(false)
    if (res.result !== 'ok') {
      setScoreError(res.error.message)
      return
    }
    setWeather({ data: res.data.weather, loading: false, error: null })
    setResult(res.data.result)
    setStage('score')
  }

  function backToPick() {
    setStage('pick')
    setResult(null)
  }

  if (noClothes) {
    return (
      <div className="dialog-backdrop dialog-backdrop--top">
        <div className="dialog dialog--small" role="alertdialog" aria-modal="true">
          <p className="dialog__message">아직 등록한 옷이 없어요.</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="stage__notice">
        <ErrorLine message={loadError} onRetry={load} />
      </div>
    )
  }

  if (!clothes) return null

  // 마네킹에 올릴 2D 이미지 주소
  const imageOf = Object.fromEntries(
    CATEGORIES.flatMap((c) => clothes[c.code].map((item) => [item.id, item.image_url])),
  )
  const worn = Object.fromEntries(
    Object.entries(outfit).map(([slot, id]) => [slot, id === 'none' ? 'none' : id ? imageOf[id] : null]),
  )
  const scoreStage = stage === 'score'

  return (
    <section className={`dressup${scoreStage ? ' dressup--score' : ''}`} aria-label="새 옷 입기">
      <div className="dressup__closet" aria-label="옷장">
        {scoreStage ? (
          <p className="sub-text">옷장</p>
        ) : (
          CATEGORIES.map((category) => (
            <div key={category.code} className="dressup__section">
              <h3 className="closet__heading">{category.label}</h3>
              <div className="closet__grid">
                {clothes[category.code].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`closet__item${outfit[category.code] === item.id ? ' closet__item--worn' : ''}`}
                    aria-pressed={outfit[category.code] === item.id}
                    onClick={() => wear(category.code, item.id)}
                  >
                    <img src={item.image_url} alt={`${category.label} ${item.id}`} />
                  </button>
                ))}
                {category.code === 'outer' && (
                  <button
                    type="button"
                    className={`closet__item closet__item--none${outfit.outer === 'none' ? ' closet__item--worn' : ''}`}
                    aria-pressed={outfit.outer === 'none'}
                    onClick={() => wear('outer', 'none')}
                  >
                    입지 않음
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="dressup__main">
        <ConditionBar
          date={date}
          dates={DATES}
          onDate={changeDate}
          regions={regions}
          region={chosenRegion ?? weather.data?.region ?? null}
          onRegion={changeRegion}
          weather={weather}
          onRetryWeather={() => loadWeather(date, chosenRegion)}
          tags={tags}
          tagId={tagId}
          onTag={setTagId}
          locked={scoreStage}
        />
        <div className="dressup__body">
          <Mannequin
            className="dressup__mannequin"
            {...mannequin}
            outfit={worn}
            showEmpty={!scoreStage}
          />
          {scoreStage && <ScoreCard date={date} result={result} onEdit={backToPick} />}
        </div>
        {!scoreStage && (
          <div className="dressup__actions">
            {scoreError && <ErrorLine message={scoreError} onRetry={checkScore} />}
            <Button variant="primary" disabled={scoring} onClick={checkScore}>
              {scoring ? '점수를 매기는 중…' : '점수 확인하기'}
            </Button>
          </div>
        )}
      </div>

      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
    </section>
  )
}

export default DressUpScreen
