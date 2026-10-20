import { useEffect, useState } from 'react'

// 서버 연결 확인 화면 (P-11). 실제 화면은 P-14부터 만듭니다.
function App() {
  const [status, setStatus] = useState('확인 중...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) =>
        setStatus(data.status === 'ok' ? '서버 연결됨' : '서버에 연결하지 못했어요'),
      )
      .catch(() => setStatus('서버에 연결하지 못했어요'))
  }, [])

  return (
    <main>
      <h1>코디 추천 웹앱</h1>
      <p>{status}</p>
    </main>
  )
}

export default App
