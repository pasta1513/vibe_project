import { useEffect, useMemo, useState } from 'react'
import { loadImage, patternFromImage, toSvg } from '../vectorize.js'
import Button from './Button.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 무늬 칸 (SCREEN-SPEC §6.2, §6.3, P-39). 옷 등록 창의 [2D 이미지]와 옷 상세의 [무늬 바꾸기]에서 씁니다.
// 무늬 표현(자동 감지, 디테일 살리기, 줄무늬 정리), 벡터 색상 수(3~10), 대표 색상만을 바꾸면
// 무늬 그림과 마네킹 미리보기가 바로 바뀝니다. [적용]을 누르면 무늬를 서버에 저장합니다. (moire-closet과 같은 방식, D-019 제안)
// imageUrl: 배경을 지운 2D 이미지, mainColor: 대표 색
// settings: { mode, colors, solid } 지금 적용된 값
// save(svg, settings): 서버에 저장하는 요청 (대표 색상만이면 svg는 null). 응답을 돌려줌
// item: 칸 안 마네킹에 입힐 옷 정보 (구분과 종류를 고르지 않았으면 null)
// onPreview(url): 주면 칸 안에 마네킹을 그리지 않고, 바뀐 무늬 주소(대표 색상만이면 null)를 알려 줍니다 (옷 상세는 왼쪽 큰 마네킹에 그림)
// onApplied(data, settings): data는 저장 응답, onCancel()

const MODES = [
  ['auto', '자동 감지'],
  ['detail', '디테일 살리기'],
  ['stripes', '줄무늬 정리'],
]

function PatternPanel({ imageUrl, mainColor, settings, save, item, mannequin, onPreview, onApplied, onCancel }) {
  const [mode, setMode] = useState(settings.mode)
  const [colors, setColors] = useState(settings.colors)
  const [solid, setSolid] = useState(settings.solid)
  const [image, setImage] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState(null)

  useEffect(() => {
    let alive = true
    loadImage(imageUrl)
      .then((img) => alive && setImage(img))
      .catch((err) => alive && setLoadError(err.message))
    return () => {
      alive = false
    }
  }, [imageUrl])

  const result = useMemo(() => (image ? patternFromImage(image, mode, colors) : null), [image, mode, colors])
  const svg = result && !solid ? toSvg(result) : null
  // 미리보기는 저장하기 전의 무늬라 data: 주소로 그립니다. 버릴 파일이 남지 않습니다.
  const previewUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null

  useEffect(() => {
    onPreview?.(previewUrl)
  }, [onPreview, previewUrl])

  async function apply() {
    setApplying(true)
    setApplyError(null)
    const next = { mode, colors, solid }
    const res = await save(svg, next)
    setApplying(false)
    if (res.result !== 'ok') {
      setApplyError(res.error.message)
      return
    }
    onApplied(res.data, next)
  }

  const noCloth = image && !result
  return (
    <div className="pt">
      <div className="pt__boxes">
        <figure className="pt__box">
          <img src={imageUrl} alt="배경을 지운 2D 이미지" />
          <figcaption>2D 이미지</figcaption>
        </figure>
        <figure className="pt__box" style={solid ? { background: mainColor } : undefined}>
          {previewUrl && <img src={previewUrl} alt="캐릭터용 무늬" />}
          <figcaption>{solid ? '대표 색상' : '캐릭터용 무늬'}</figcaption>
        </figure>
      </div>

      {!onPreview && (
        <div className="pt__mannequin">
          {item ? (
            <Mannequin
              {...mannequin}
              outfit={{ [item.category]: { ...item, pattern_url: previewUrl } }}
              title="무늬를 입힌 마네킹"
            />
          ) : (
            <p className="sub-text">구분과 종류를 고르면 마네킹에도 입혀 보여 줘요.</p>
          )}
        </div>
      )}

      <div className="pt__row">
        <span className="pt__label">무늬 표현</span>
        <div className="pt__seg" role="radiogroup" aria-label="무늬 표현">
          {MODES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={mode === value ? 'on' : ''}
              disabled={solid}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'auto' && result && !solid && (
        <p className="pt__note">{result.mode === 'stripes' ? '줄무늬로 보고 줄마다 한 색으로 정리했어요.' : '줄무늬가 아니라서 디테일을 살렸어요.'}</p>
      )}

      <label className="fitter__row pt__range">
        <span>벡터 색상 수</span>
        <input
          type="range"
          min={3}
          max={10}
          step={1}
          value={colors}
          disabled={solid}
          style={{ '--p': `${((colors - 3) / 7) * 100}%` }}
          onChange={(e) => setColors(Number(e.target.value))}
        />
        <span className="fitter__value">{colors}색</span>
      </label>

      {result && !solid && (
        <div className="pt__palette" aria-label="뽑은 색">
          {result.palette.map((c, i) => (
            <span key={i} style={{ background: c }} title={c} />
          ))}
        </div>
      )}

      <label className="pt__check">
        <input type="checkbox" checked={solid} onChange={(e) => setSolid(e.target.checked)} />
        대표 색상만 (무늬 없이 한 색으로)
      </label>

      {loadError && <ErrorLine message={loadError} />}
      {noCloth && <p className="sub-text">옷 부분이 비어 있어요. [배경 고치기]로 옷을 되살리거나 대표 색상만 써 주세요.</p>}
      {applyError && <ErrorLine message={applyError} onRetry={applying ? undefined : apply} />}
      <div className="bg-editor__row">
        <Button onClick={onCancel}>취소</Button>
        <Button variant="primary" disabled={applying || (!solid && !svg)} onClick={apply}>
          {applying ? '적용하는 중…' : '적용'}
        </Button>
      </div>
    </div>
  )
}

export default PatternPanel
