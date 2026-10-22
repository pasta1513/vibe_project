import { useLayoutEffect, useState } from 'react'

// 시안(style/html)의 1536×1024 캔버스를 창 크기에 맞춰 줄이거나 늘립니다 (시안 common.js의 fit). (P-38)
export const STAGE_W = 1536
export const STAGE_H = 1024

export function useFitScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return scale
}
