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

const HINT = '배경이 복잡하거나 옷과 배경색이 비슷하면 브러시로 직접 고쳐 주세요.'
const MAX_UNDO = 20
const TOOLS = [
  ['pick', '배경색 고르기'],
  ['erase', '지우기'],
  ['restore', '복원'],
]

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

  return (
    <div className="bg-editor">
      <p className="sub-text">{HINT}</p>
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

      <div className="bg-editor__tools" role="radiogroup" aria-label="도구">
        {TOOLS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={tool === value}
            className={`btn bg-editor__tool${tool === value ? ' bg-editor__tool--on' : ''}`}
            onClick={() => setTool(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="fitter__row">
        <span>브러시 굵기</span>
        <input type="range" min={4} max={60} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        <span className="fitter__value">{size}px</span>
      </label>
      <label className="fitter__row">
        <span>허용 오차</span>
        <input
          type="range"
          min={0}
          max={120}
          step={1}
          value={tolerance}
          onPointerDown={remember}
          onKeyDown={remember}
          onChange={(e) => changeTolerance(Number(e.target.value))}
        />
        <span className="fitter__value">{tolerance}</span>
      </label>

      <div className="bg-editor__row">
        <Button disabled={undoCount === 0} onClick={undo}>
          실행 취소
        </Button>
        <Button onClick={reset}>초기화</Button>
        <Button onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? '고친 모습 보기' : '원래 사진 보기'}</Button>
      </div>
      {nothingLeft && (
        <p className="sub-text">옷 부분이 남아 있지 않아요. [초기화]나 복원 브러시로 되살려 주세요.</p>
      )}
      {applyError && <ErrorLine message={applyError} onRetry={applying ? undefined : apply} />}
      <div className="bg-editor__row">
        <Button onClick={onCancel}>취소</Button>
        <Button variant="primary" disabled={!w || nothingLeft || applying} onClick={apply}>
          {applying ? '적용하는 중…' : '적용'}
        </Button>
      </div>
    </div>
  )
}

export default BackgroundEditor
