import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import '../styles/dressup.css'
import { CATEGORIES, SLOT_LABEL, isoDate, outfitKey, subjectParticle } from '../labels.js'
import pickBg from '../assets/dressup/pick-bg.png'
import recommendBg from '../assets/dressup/recommend-bg.png'
import scoreBg from '../assets/dressup/score-bg.png'
import AlertDialog from './AlertDialog.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import {
  ClosetPanel,
  RecommendPanel,
  ResultPanel,
  ScoreActions,
  SidePanel,
  TodayPanel,
} from './DressUpPanels.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 새 옷 입기 (SCREEN-SPEC §5): 옷 고르는 단계(5.2), 추천 보기(5.3), 점수 확인 단계(5.4)
// 시안 style/html의 08_1(따뜻한·파스텔)과 12를 옮겼습니다. 배경은 시안 PNG에서 가운데 캐릭터 자리를 메운 그림입니다. (P-38)
// 편집 중인 코디는 화면만 들고 있고, 새로고침하면 사라집니다. (ARCHITECTURE §2.1)

const EMPTY_OUTFIT = { top: null, bottom: null, dress: null, shoes: null, outer: null }
const NO_CLOTHES_MS = 2000
// 지운 옷 칸을 다시 고르라는 알림이 보이는 시간 (SCREEN-SPEC §2.6)
const RESELECT_MS = 3000
// 오늘 포함 5일 (PRD §5)
const DATES = [0, 1, 2, 3, 4].map((offset) => isoDate(offset))

// 빈 칸 경고창에 적을 칸. 아우터 "입지 않음"은 채운 것으로 봅니다. (PRD §6 흐름 2)
// 받침이 있으면 "을", 없으면 "를" (예: 하의를, 신발을)
function objectParticle(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '를'
  return (last - 0xac00) % 28 === 0 ? '를' : '을'
}

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

// initial: 코디 일기나 즐겨찾기의 "입혀 보기"로 열 때 받은 것 (API-SPEC §6 입혀 보기의 받는 것)
//   { date, outfit, tag_id, deleted_slots, weather, weather_error }. 메뉴로 열면 없습니다.
function DressUpScreen({ mannequin, regions, onNoClothes, onConfirmed, initial, showToast }) {
  const [clothes, setClothes] = useState(null)
  const [tags, setTags] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [noClothes, setNoClothes] = useState(false)

  const [date, setDate] = useState(initial?.date ?? DATES[0])
  const [chosenRegion, setChosenRegion] = useState(null) // 사용자가 조건 띠에서 바꾼 지역
  const [tagId, setTagId] = useState(initial?.tag_id ?? null)
  const [persona, setPersona] = useState('expert') // 추천 페르소나, 기본은 전문가 (P-39)
  const [requestText, setRequestText] = useState('') // 추천 요청 글, 저장하지 않음 (P-39)
  const [weather, setWeather] = useState({ data: null, loading: true, error: null })

  // 입혀 보기로 열면 그 코디를 입힙니다. 저장된 기록에서 아우터가 비어 있으면 "입지 않음"입니다.
  // 지운 옷이 든 칸은 서버가 비워서 보냅니다.
  const [outfit, setOutfit] = useState(() => {
    if (!initial) return EMPTY_OUTFIT
    const o = { ...EMPTY_OUTFIT, ...initial.outfit }
    if (!o.outer && !initial.deleted_slots.includes('outer')) o.outer = 'none'
    return o
  })
  const [reselect, setReselect] = useState(initial?.deleted_slots ?? [])
  const [stage, setStage] = useState('pick') // pick: 옷 고르는 단계, recommend: 추천 보기, score: 점수 확인 단계
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [result, setResult] = useState(null)
  const [alert, setAlert] = useState(null)
  const [closetTab, setClosetTab] = useState('top') // 왼쪽 "의상 선택"에서 고른 구분 (시안의 칩)
  const [clothingTags, setClothingTags] = useState({}) // 옷 번호 → [색, 종류] 이름

  // 받은 추천 목록과 그 목록을 받을 때의 조건. [추천받기]를 다시 누르거나 메뉴를 떠나면 버립니다.
  // (사람이 정함, 2026-10-21)
  const [recommendation, setRecommendation] = useState(null) // { data, conditions }
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState(null)

  // 확정하기 (API-SPEC §5.3)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [sameDate, setSameDate] = useState(null) // 같은 날짜 확인 질문에서 다시 보낼 요청 내용
  const [favoriting, setFavoriting] = useState(false)
  const [favoriteError, setFavoriteError] = useState(null)
  // 확정한 뒤 화면에 옷 그림을 넘길 때 씁니다.
  const clothingOfRef = useRef({})
  // 마지막으로 보낸 확정하기 요청 내용
  const lastConfirm = useRef(null)

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
    if (initial?.weather) setWeather({ data: initial.weather, loading: false, error: null })
    else if (initial?.weather_error) setWeather({ data: null, loading: false, error: initial.weather_error })
    else loadWeather(initial?.date ?? DATES[0], null)
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
    // 점수 확인의 "오늘의 코디"에 보일 #키워드. 옷 목록에는 키워드가 없어 옷마다 상세를 받습니다. (P-38)
    const ids = CATEGORIES.flatMap((c) => clothesRes.data[c.code].map((item) => item.id))
    Promise.all(ids.map((id) => api.getClothing(id))).then((results) => {
      const next = {}
      results.forEach((res, i) => {
        if (res.result === 'ok') next[ids[i]] = [...res.data.keywords.color, ...res.data.keywords.type].map((k) => k.name)
      })
      setClothingTags(next)
    })
  }, [loadWeather, initial])

  useEffect(() => {
    load()
  }, [load])

  // 지운 옷이 든 칸이 있으면 "⚠ 지운 옷이 있어요. 하의를 다시 골라 주세요"를 3초 보입니다.
  useEffect(() => {
    if (reselect.length === 0) return undefined
    const timer = setTimeout(() => setReselect([]), RESELECT_MS)
    return () => clearTimeout(timer)
  }, [reselect])

  // 옷이 한 벌도 없으면 경고창을 버튼 없이 2초(사람이 정함, 2026-10-23) 보인 뒤 옷장으로 옮겨 갑니다. (SCREEN-SPEC §2.6)
  useEffect(() => {
    if (!noClothes) return undefined
    const timer = setTimeout(onNoClothes, NO_CLOTHES_MS)
    return () => clearTimeout(timer)
  }, [noClothes, onNoClothes])

  // 추천 보기에서 조건을 바꾸면 목록을 닫고 옷 고르는 단계로 돌아갑니다. [추천 다시 보기]는 남습니다.
  function leaveRecommend() {
    if (stage === 'recommend') setStage('pick')
  }

  function changeDate(day) {
    leaveRecommend()
    setDate(day)
    loadWeather(day, chosenRegion)
  }

  function changeRegion(region) {
    leaveRecommend()
    setChosenRegion(region)
    loadWeather(date, region)
  }

  function changeTag(id) {
    leaveRecommend()
    setTagId(id)
  }

  // 페르소나도 조건이라 바꾸면 목록을 닫습니다. 요청 글은 고쳐도 목록을 닫지 않습니다. (P-39)
  function changePersona(value) {
    leaveRecommend()
    setPersona(value)
  }

  // 추천받기. 태그를 고르지 않았으면 먼저 고르라고 알립니다. (SCREEN-SPEC §5.1)
  async function requestRecommend() {
    if (tagId == null) {
      setAlert('스타일 태그를 먼저 골라 주세요.')
      return
    }
    setRecommending(true)
    setRecommendError(null)
    const res = await api.recommend({
      date,
      region: chosenRegion,
      tag_id: tagId,
      persona,
      request: requestText.trim() || null,
    })
    setRecommending(false)
    // "내 스타일"인데 즐겨찾기가 없으면 다시 시도로는 풀리지 않아 경고창으로 알립니다.
    if (res.result === 'error' && res.error.kind === 'no_favorites') {
      setAlert(res.error.message)
      return
    }
    if (res.result !== 'ok') {
      setRecommendError(res.error.message)
      return
    }
    const got = res.data.weather ?? weather.data
    if (res.data.weather) setWeather({ data: res.data.weather, loading: false, error: null })
    setRecommendation({ data: res.data, conditions: { date, chosenRegion, tagId, persona, weather: got } })
    setStage('recommend')
  }

  // 입혀 보기: 그 코디를 입은 채 옷 고르는 단계로 엽니다. 아우터가 없으면 "입지 않음"입니다.
  function tryOn(index) {
    const picked = recommendation.data.outfits[index].outfit
    setOutfit({ ...EMPTY_OUTFIT, ...picked, outer: picked.outer ?? 'none' })
    setScoreError(null)
    setStage('pick')
  }

  // 확정하기: 화면이 들고 있던 코디, 날짜, 날씨, 태그, 점수 결과를 보냅니다. (D-006)
  // 같은 날짜에 기록이 있으면 묻고, [바꾸기]를 누르면 "확인함"을 붙여 다시 보냅니다.
  async function sendConfirm(body) {
    // 실패하면 [다시 시도]가 같은 내용(같은 날짜 [바꾸기]였으면 "확인함"까지)을 다시 보냅니다. (SCREEN-SPEC §2.7, T-58)
    lastConfirm.current = body
    setConfirming(true)
    setConfirmError(null)
    const res = await api.confirmOutfit(body)
    setConfirming(false)
    if (res.result === 'confirm') {
      setSameDate(body)
      return
    }
    if (res.result !== 'ok') {
      setConfirmError(res.error.message)
      return
    }
    clothingOfRef.current = clothingOf
    const worn = Object.fromEntries(
      Object.entries(body.outfit).map(([slot, id]) => [slot, id ? clothingOfRef.current[id] : null]),
    )
    if (!body.outfit.outer) worn.outer = 'none'
    // 확정한 뒤 화면의 [즐겨찾기에 추가]에 쓸 코디 구성과 태그도 넘깁니다. (P-38)
    onConfirmed({ date: res.data.date, weather: res.data.weather, worn, outfit: body.outfit, tagId: body.tag_id })
  }

  // 추천 목록에서 바로 확정: 추천을 받을 때의 조건과 이유가 남습니다.
  function confirmRecommendation(index) {
    const item = recommendation.data.outfits[index]
    const c = recommendation.conditions
    sendConfirm({
      outfit: item.outfit,
      date: c.date,
      weather: c.weather,
      tag_id: c.tagId,
      result: { score: item.score, note_type: item.note_type, summary: item.summary, details: item.details },
    })
  }

  // 점수 확인 단계에서 확정: 코멘트가 남습니다.
  function confirmScored() {
    sendConfirm({
      outfit: { ...outfit, outer: outfit.outer === 'none' ? null : outfit.outer },
      date,
      weather: weather.data,
      tag_id: tagId,
      result,
    })
  }

  // 추천 카드의 별이 바뀌면 같은 코디 구성의 카드를 함께 바꿉니다. (SCREEN-SPEC §2.8, 제안)
  function changeFavorite(changedOutfit, favoriteId) {
    const key = outfitKey(changedOutfit)
    setRecommendation((prev) =>
      prev && {
        ...prev,
        data: {
          ...prev.data,
          outfits: prev.data.outfits.map((o) =>
            outfitKey(o.outfit) === key ? { ...o, favorite_id: favoriteId } : o,
          ),
        },
      },
    )
  }

  // 점수 확인 단계의 [즐겨찾기]: 넣으면 짧은 알림, 이미 있으면 알림창 (SCREEN-SPEC §2.6)
  async function addScoredFavorite() {
    const sent = { ...outfit, outer: outfit.outer === 'none' ? null : outfit.outer }
    setFavoriting(true)
    setFavoriteError(null)
    const res = await api.addFavorite({ outfit: sent, tag_id: tagId })
    setFavoriting(false)
    if (res.result === 'ok') {
      changeFavorite(sent, res.data.id)
      showToast('즐겨찾기에 등록되었습니다.')
    } else if (res.error.kind === 'duplicate') {
      setAlert(res.error.message)
    } else {
      setFavoriteError(res.error.message)
    }
  }

  // 추천 다시 보기: AI를 다시 부르지 않고, 추천을 받을 때의 조건과 같은 목록으로 돌아갑니다.
  function reviewRecommendations() {
    const c = recommendation.conditions
    setDate(c.date)
    setChosenRegion(c.chosenRegion)
    setTagId(c.tagId)
    setPersona(c.persona)
    if (c.weather) setWeather({ data: c.weather, loading: false, error: null })
    else loadWeather(c.date, c.chosenRegion)
    setStage('recommend')
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
    setConfirmError(null)
    setFavoriteError(null)
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

  // 마네킹에 입힐 옷 한 벌 정보 (의상 틀, 대표 색, 2D 이미지 주소, D-016)
  const clothingOf = Object.fromEntries(
    CATEGORIES.flatMap((c) => clothes[c.code].map((item) => [item.id, item])),
  )
  const worn = Object.fromEntries(
    Object.entries(outfit).map(([slot, id]) => [slot, id === 'none' ? 'none' : id ? clothingOf[id] : null]),
  )
  const scoreStage = stage === 'score'
  const recommendStage = stage === 'recommend'
  const background = scoreStage ? scoreBg : recommendStage ? recommendBg : pickBg

  // 시안 08_1(옷 고르기·추천)과 12(점수 확인)를 그대로 옮긴 장면입니다. (P-38)
  return (
    <section
      className={`du du--${stage}`}
      aria-label="새 옷 입기"
      style={{ '--src': `url(${background})` }}
    >
      {!scoreStage && (
        <ClosetPanel
          clothes={clothes}
          outfit={outfit}
          onWear={wear}
          tab={closetTab}
          onTab={setClosetTab}
          mannequin={mannequin}
        />
      )}

      {!scoreStage && (
        <div className="du-bubble" aria-hidden="true">
          이 코디 어때?
        </div>
      )}
      <Mannequin className="du-mannequin" {...mannequin} outfit={worn} showEmpty={!scoreStage} />
      {/* 배경 그림의 빈 거울에 지금 입힌 코디의 뒷모습이 비칩니다. 점수 확인 배경에는 거울이 없습니다. */}
      {!scoreStage && (
        <div className="du-mirror" aria-hidden="true">
          <Mannequin {...mannequin} outfit={worn} back />
        </div>
      )}

      {!scoreStage && (
        <SidePanel
          weather={weather}
          onRetryWeather={() => loadWeather(date, chosenRegion)}
          regions={regions}
          region={chosenRegion ?? weather.data?.area ?? weather.data?.region ?? null}
          onRegion={changeRegion}
          date={date}
          dates={DATES}
          onDate={changeDate}
          tags={tags}
          tagId={tagId}
          onTag={changeTag}
          persona={persona}
          onPersona={changePersona}
          requestText={requestText}
          onRequestText={setRequestText}
          onRecommend={requestRecommend}
          recommending={recommending}
        />
      )}

      {/* 알림 줄: 지운 옷 다시 고르기, 추천·확정·즐겨찾기 실패 (SCREEN-SPEC §2.6, §2.7) */}
      <div className="du-notices">
        {reselect.length > 0 && (
          <p className="reselect-notice" role="status">
            ⚠ 지운 옷이 있어요. {reselect.map((slot) => SLOT_LABEL[slot]).join(', ')}
            {objectParticle(SLOT_LABEL[reselect[reselect.length - 1]])} 다시 골라 주세요
          </p>
        )}
        {recommendError && <ErrorLine message={recommendError} onRetry={requestRecommend} />}
        {confirmError && (
          <ErrorLine
            message={confirmError}
            onRetry={confirming ? undefined : () => sendConfirm(lastConfirm.current)}
          />
        )}
        {favoriteError && <ErrorLine message={favoriteError} />}
        {stage === 'pick' && scoreError && <ErrorLine message={scoreError} onRetry={checkScore} />}
      </div>

      {recommendStage && (
        <RecommendPanel
          recommendation={recommendation.data}
          clothingOf={clothingOf}
          mannequin={mannequin}
          tagId={recommendation.conditions.tagId}
          onTryOn={tryOn}
          onConfirm={confirmRecommendation}
          confirming={confirming}
          onFavorite={changeFavorite}
          onGoCloset={onNoClothes}
        />
      )}

      {stage === 'pick' && (
        <div className="du-actions">
          {recommendation && (
            <button type="button" className="du-review" onClick={reviewRecommendations}>
              추천 다시 보기
            </button>
          )}
          <button type="button" className="du-score" disabled={scoring} onClick={checkScore}>
            <span aria-hidden="true">✦</span>
            {scoring ? '점수를 매기는 중…' : '점수 확인하기'}
          </button>
        </div>
      )}

      {scoreStage && (
        <>
          <TodayPanel
            date={date}
            weather={weather}
            outfit={outfit}
            clothingOf={clothingOf}
            tagsOf={(id) => clothingTags[id] ?? []}
            mannequin={mannequin}
          />
          <ResultPanel result={result} mascotSrc={scoreBg} />
          <ScoreActions
            onEdit={backToPick}
            onConfirm={confirmScored}
            confirming={confirming}
            onFavorite={addScoredFavorite}
            favoriting={favoriting}
          />
        </>
      )}

      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
      {sameDate && (
        <ConfirmDialog
          message="이미 이 날의 코디가 있어요. 바꿀까요?"
          confirmLabel="바꾸기"
          danger
          onCancel={() => setSameDate(null)}
          onConfirm={() => {
            const body = sameDate
            setSameDate(null)
            sendConfirm({ ...body, confirmed: true })
          }}
        />
      )}
    </section>
  )
}

export default DressUpScreen
