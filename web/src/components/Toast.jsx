import { useEffect } from 'react'

// 짧은 알림: 화면 아래 가운데에 3초 동안 보였다가 사라집니다. (DESIGN §4.3)
const TOAST_MS = 3000

function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone])

  if (!message) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}

export default Toast
