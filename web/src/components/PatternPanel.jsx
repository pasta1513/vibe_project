import { useEffect, useMemo, useState } from 'react'
import { loadImage, patternFromImage, toSvg } from '../vectorize.js'
import Button from './Button.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin, { GarmentIllustration } from './Mannequin.jsx'

// 무늬 칸 (SCREEN-SPEC §6.2, §6.3, P-44). 옷 등록 창의 [2D 이미지]와 옷 상세의 [무늬 바꾸기]에서 씁니다.
// 무늬 표현(자동 감지, 디테일 살리기, 줄무늬 정리), 벡터 색상 수(3~10), 대표 색상만을 바꾸면
// 무늬 그림과 마네킹 미리보기가 바로 바뀝니다. [적용]을 누르면 무늬를 서버에 저장합니다. (moire-closet과 같은 방식, D-021 제안)
// imageUrl: 배경을 지운 2D 이미지, mainColor: 대표 색
// settings: { mode, colors, solid } 지금 적용된 값
// save(svg, settings): 서버에 저장하는 요청 (대표 색상만이면 svg는 null). 응답을 돌려줌
// item: 2D 일러스트와 칸 안 마네킹에 입힐 옷 정보 (구분과 종류를 고르지 않았으면 null)
// onPreview(url): 주면 바뀐 무늬 주소(대표 색상만이면 null)를 알려 줍니다 (옷 상세는 왼쪽 큰 마네킹에 그림)
// layout: 'panel'이면 등록 화면 [2D 이미지] 탭의 시안 배치 (2D 변환 이미지와 마네킹 미리보기를 나란히, 2026-10-23).
//         없으면 옷 상세의 배치 (2D 일러스트와 캐릭터용 무늬를 나란히)
// onApplied(data, settings): data는 저장 응답, onCancel()

// 등록 화면 [2D 이미지] 탭에서 표현 아래에 보이는 설명 (자동 감지는 시안 문장, 나머지는 제안)
const MODE_NOTES = {
  auto: '옷의 무늬를 분석해 자연스럽게 표현해요.',
  detail: '사진의 색과 디테일을 최대한 살려요.',
  stripes: '줄무늬를 줄마다 한 색으로 깔끔하게 정리해요.',
}

const MODES = [
  ['auto', '자동 감지'],
  ['detail', '디테일 살리기'],
  ['stripes', '줄무늬 정리'],
]

function PatternPanel({ imageUrl, mainColor, settings, save, item, mannequin, onPreview, onApplied, onCancel, layout }) {
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
  const illustration = item ? (
    <GarmentIllustration
      className="garment-illust pt__illust"
      item={{ ...item, pattern_url: previewUrl }}
      mannequin={mannequin}
      title="옷만 그린 2D 일러스트"
    />
  ) : (
    <img src={imageUrl} alt="배경을 지운 2D 이미지" />
  )
  const panel = layout === 'panel'
  return (
    <div className={`pt${panel ? ' pt--panel' : ''}`}>
      {panel ? (
        // 등록 화면 [2D 이미지] 탭 (시안): 2D 변환 이미지와 마네킹 미리보기를 나란히
        <div className="pt__boxes">
          <figure className="pt__card">
            <figcaption>2D 변환 이미지</figcaption>
            <div className="pt__card-pic pt__card-pic--check">{illustration}</div>
          </figure>
          <figure className="pt__card">
            <figcaption>미리보기 (캐릭터 착용)</figcaption>
            <div className="pt__card-pic">
              <Mannequin
                {...mannequin}
                outfit={item ? { [item.category]: { ...item, pattern_url: previewUrl } } : undefined}
                title={item ? '무늬를 입힌 마네킹' : '잠옷을 입은 마네킹'}
              />
              {!item && <p className="sub-text">구분과 종류를 고르면 입혀 보여 줘요.</p>}
            </div>
          </figure>
        </div>
      ) : (
        <div className="pt__boxes">
          {/* 구분과 종류를 골랐으면 옷만 그린 2D 일러스트(바꾸는 중인 무늬), 아니면 배경을 지운 2D 이미지 (사람이 정함, 2026-10-23) */}
          <figure className="pt__box">
            {illustration}
            <figcaption>{item ? '2D 일러스트' : '2D 이미지'}</figcaption>
          </figure>
          <figure className="pt__box" style={solid ? { background: mainColor } : undefined}>
            {previewUrl && <img src={previewUrl} alt="캐릭터용 무늬" />}
            <figcaption>{solid ? '대표 색상' : '캐릭터용 무늬'}</figcaption>
          </figure>
        </div>
      )}

      <div className="pt__controls">
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
        {panel && !solid && <p className="pt__note">{MODE_NOTES[mode]}</p>}
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
      </div>

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
