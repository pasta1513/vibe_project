import { useForegroundBounds } from '../foregroundBounds.js'

// 배경을 지운 옷 2D 이미지를 보여 줄 때 쓰는 그림. 이미지는 옷 둘레로 자르지 않고 저장되므로, 옷이 있는 부분(투명하지 않은 부분)을
// 구해 그 범위를 그림 상자에 맞춥니다. (U3 foregroundBounds.js, 사용자 결정 2) 범위를 아직 모르거나 구하지 못하면 이미지 전체를 그대로 보입니다.
// 저장 파일·DB·API는 바꾸지 않습니다. 배경 고치기(BackgroundEditor)와 올린 사진·편집 캔버스에는 쓰지 않습니다. (좌표를 그대로 써야 함)
function ForegroundImage({ className, src, alt }) {
  const bounds = useForegroundBounds(src)
  if (!bounds) return <img className={className} src={src} alt={alt} />
  return (
    <svg
      className={className}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={alt}
    >
      <image href={src} x={0} y={0} width={bounds.nw} height={bounds.nh} />
    </svg>
  )
}

export default ForegroundImage
