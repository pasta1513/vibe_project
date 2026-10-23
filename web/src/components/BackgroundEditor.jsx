import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import {
  DEFAULT_TOLERANCE,
  applyMask,
  autoMask,
  finalMask,
  keptCount,
  maskFromAlpha,
  paintCircle,
} from '../imageEdit.js'
import Button from './Button.jsx'
import ErrorLine from './ErrorLine.jsx'

// 배경 고치기 (SCREEN-SPEC §6.2, DESIGN §5.6, D-015, P-34). 등록 창에서만 씁니다.
// 서버가 자동으로 지운 2D 이미지를 처음 상태로 두고, 원래 사진 위에서 마스크를 고칩니다.
// upload: { upload_id, photo_url, image_url }
// onApplied({ image_url, main_color, pattern_url }): [적용]이 끝나면 부름. onCancel: [취소]
// (2026-10-23 바꿈) 등록 화면 [배경 고치기] 탭의 시안 배치: 왼쪽 그림, 오른쪽 도구 버튼 세로, 아래 슬라이더와
// [원본에서 배경 다시 제거](= 초기화). 기능은 같고 이름은 시안을 따릅니다. (사람이 정함)

const MAX_UNDO = 20
// 시안의 도구 버튼 이름과 아이콘. "자동 배경 제거"는 지금의 배경색 고르기 도구(누른 색과 비슷한 배경을 지움)입니다 (사람이 정함, 2026-10-23).
const TOOLS = [
  ['pick', '자동 배경 제거', 'M4 20 14 10M13 4v3M18 9h-3M16 6l-2 2M18 14v3M16.5 15.5h3M7 4v3M5.5 5.5h3'],
  ['erase', '브러시 지우기', 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4'],
  ['restore', '복원하기', 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'],
]
const UNDO_ICON = 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5'
const ORIGINAL_ICON = 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 4v16'

function ToolIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function pixelsOf(img, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function BackgroundEditor({ upload, onApplied, onCancel }) {
  const canvasRef = useRef(null)
  const ringRef = useRef(null)
  // 큰 배열은 ref에 두고, 다시 그릴 때만 version을 올립니다.
  const work = useRef(null) // { original, serverMask, auto, brush, width, height }
  const history = useRef([])
  const painting = useRef(false)
  const [version, setVersion] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [tool, setTool] = useState('erase')
  const [size, setSize] = useState(20)
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [picks, setPicks] = useState([])
  const [showOriginal, setShowOriginal] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState(null)

  // 원래 사진을 2D 이미지와 같은 크기로 읽고, 서버 결과의 투명한 칸을 처음 마스크로 씁니다.
  useEffect(() => {
    let alive = true
    Promise.all([loadImage(upload.photo_url), loadImage(upload.image_url)])
      .then(([photo, image]) => {
        if (!alive) return
        const width = image.naturalWidth
        const height = image.naturalHeight
        const serverMask = maskFromAlpha(pixelsOf(image, width, height))
        work.current = {
          original: pixelsOf(photo, width, height),
          serverMask,
          auto: serverMask,
          brush: new Uint8Array(width * height),
          width,
          height,
        }
        setVersion((v) => v + 1)
      })
      .catch(() => alive && setLoadError('사진을 읽지 못했어요.'))
    return () => {
      alive = false
    }
  }, [upload.photo_url, upload.image_url])

  // 그리기: 원래 사진 보기면 마스크 없이, 아니면 고친 결과. 투명한 곳은 CSS 체크무늬가 보입니다.
  useEffect(() => {
    const w = work.current
    const canvas = canvasRef.current
    if (!w || !canvas) return
    canvas.width = w.width
    canvas.height = w.height
    const shown = showOriginal ? w.original : applyMask(w.original, finalMask(w.auto, w.brush))
    canvas.getContext('2d').putImageData(shown, 0, 0)
  }, [version, showOriginal])

  function remember() {
    const w = work.current
    history.current.push({ auto: w.auto, brush: w.brush.slice(), tolerance, picks })
    if (history.current.length > MAX_UNDO) history.current.shift()
    setUndoCount(history.current.length)
  }

  function undo() {
    const last = history.current.pop()
    if (!last) return
    Object.assign(work.current, { auto: last.auto, brush: last.brush })
    setTolerance(last.tolerance)
    setPicks(last.picks)
    setUndoCount(history.current.length)
    setVersion((v) => v + 1)
  }

  // 허용 오차를 바꾸면 늘 원래 사진에서 다시 계산합니다. 브러시로 고친 곳은 그대로 둡니다.
  function changeTolerance(value) {
    const w = work.current
    setTolerance(value)
    w.auto = autoMask(w.original, value, picks)
    setVersion((v) => v + 1)
  }

  function reset() {
    const w = work.current
    if (!w) return
    remember()
    w.auto = w.serverMask
    w.brush = new Uint8Array(w.width * w.height)
    setTolerance(DEFAULT_TOLERANCE)
    setPicks([])
    setVersion((v) => v + 1)
  }

  // 화면 좌표 → 사진 좌표
  function toImage(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    const w = work.current
    return {
      x: ((event.clientX - rect.left) / rect.width) * w.width,
      y: ((event.clientY - rect.top) / rect.height) * w.height,
      scale: rect.width / w.width,
    }
  }

  function paint(event) {
    const w = work.current
    const { x, y } = toImage(event)
    paintCircle(w.brush, w.width, w.height, x, y, size / 2, tool === 'erase' ? 1 : 2)
    setVersion((v) => v + 1)
  }

  function handlePointerDown(event) {
    const w = work.current
    if (!w || showOriginal) return
    const { x, y } = toImage(event)
    const index = Math.floor(y) * w.width + Math.floor(x)
    if (index < 0 || index >= w.width * w.height) return
    remember()
    if (tool === 'pick') {
      const p = index * 4
      const nextPicks = [...picks, { index, color: [w.original.data[p], w.original.data[p + 1], w.original.data[p + 2]] }]
      setPicks(nextPicks)
      w.auto = autoMask(w.original, tolerance, nextPicks)
      setVersion((v) => v + 1)
      return
    }
    painting.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    paint(event)
  }

  function handlePointerMove(event) {
    // 브러시 굵기만큼의 원 테두리 (DESIGN §5.6)
    const ring = ringRef.current
    if (ring && work.current && tool !== 'pick') {
      const rect = canvasRef.current.getBoundingClientRect()
      const { scale } = toImage(event)
      const d = size * scale
      Object.assign(ring.style, {
        display: 'block',
        width: `${d}px`,
        height: `${d}px`,
        left: `${event.clientX - rect.left - d / 2}px`,
        top: `${event.clientY - rect.top - d / 2}px`,
      })
    }
    if (painting.current) paint(event)
  }

  function handlePointerUp() {
    painting.current = false
  }

  async function apply() {
    const w = work.current
    setApplying(true)
    setApplyError(null)
    const canvas = document.createElement('canvas')
    canvas.width = w.width
    canvas.height = w.height
    canvas.getContext('2d').putImageData(applyMask(w.original, finalMask(w.auto, w.brush)), 0, 0)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const res = await api.applyEditedImage(upload.upload_id, blob)
    setApplying(false)
    if (res.result === 'ok') onApplied(res.data)
    else setApplyError(res.error.message)
  }

  if (loadError) return <ErrorLine message={loadError} />
  const w = work.current
  const nothingLeft = w ? keptCount(finalMask(w.auto, w.brush)) === 0 : false

  const stage = (
    <div className="photo-box bg-editor__stage">
      <canvas
        ref={canvasRef}
        className={`bg-editor__canvas bg-editor__canvas--${tool}`}
        aria-label="배경 고치기"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => ringRef.current && (ringRef.current.style.display = 'none')}
      />
      <div ref={ringRef} className="bg-editor__ring" aria-hidden="true" />
    </div>
  )
  const footer = (
    <>
      {nothingLeft && (
        <p className="sub-text">옷 부분이 남아 있지 않아요. [원본에서 배경 다시 제거]나 [복원하기]로 되살려 주세요.</p>
      )}
      {applyError && <ErrorLine message={applyError} onRetry={applying ? undefined : apply} />}
      <div className="bg-editor__row">
        <Button onClick={onCancel}>취소</Button>
        <Button variant="primary" disabled={!w || nothingLeft || applying} onClick={apply}>
          {applying ? '적용하는 중…' : '적용'}
        </Button>
      </div>
    </>
  )

  const pct = (v, min, max) => ({ '--p': `${((v - min) / (max - min)) * 100}%` })
  return (
    <div className="bg-editor bg-editor--panel">
      <div className="bg-editor__main">
        {stage}
        <div className="bg-editor__side">
          <div role="radiogroup" aria-label="도구" className="bg-editor__group">
            {TOOLS.map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tool === value}
                className={`bg-editor__sbtn${tool === value ? ' bg-editor__sbtn--on' : ''}`}
                onClick={() => setTool(value)}
              >
                <ToolIcon d={icon} />
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="bg-editor__sbtn" disabled={undoCount === 0} onClick={undo}>
            <ToolIcon d={UNDO_ICON} />
            되돌리기
          </button>
          <button
            type="button"
            className={`bg-editor__sbtn${showOriginal ? ' bg-editor__sbtn--on' : ''}`}
            aria-pressed={showOriginal}
            onClick={() => setShowOriginal(!showOriginal)}
          >
            <ToolIcon d={ORIGINAL_ICON} />
            원본 보기
          </button>
        </div>
      </div>
      <label className="fitter__row bg-editor__range">
        <span>브러시 크기</span>
        <input
          type="range"
          min={4}
          max={60}
          step={1}
          value={size}
          style={pct(size, 4, 60)}
          onChange={(e) => setSize(Number(e.target.value))}
        />
        <span className="fitter__value">{size}</span>
      </label>
      <label className="fitter__row bg-editor__range">
        <span>제거 강도</span>
        <input
          type="range"
          min={0}
          max={120}
          step={1}
          value={tolerance}
          style={pct(tolerance, 0, 120)}
          onPointerDown={remember}
          onKeyDown={remember}
          onChange={(e) => changeTolerance(Number(e.target.value))}
        />
        <span className="fitter__value">{tolerance}</span>
      </label>
      <button type="button" className="bg-editor__redo" onClick={reset}>
        원본에서 배경 다시 제거
      </button>
      <p className="bg-editor__note">다시 실행하면 수동 편집은 초기화됩니다.</p>
      {footer}
    </div>
  )
}

export default BackgroundEditor
