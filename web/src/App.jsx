import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import ErrorLine from './components/ErrorLine.jsx'
import Mannequin from './components/Mannequin.jsx'
import MannequinPicker from './components/MannequinPicker.jsx'
import MenuBar from './components/MenuBar.jsx'
import Room from './components/Room.jsx'
import Wardrobe from './components/Wardrobe.jsx'

function App() {
  // loading: 설정을 받는 중, error: 받지 못함, ready: 받음
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [mannequin, setMannequin] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // 앱 열기 (API-SPEC §3)의 응답을 반영합니다.
  const applySettings = useCallback((res) => {
    if (res.result === 'ok') {
      setMannequin(res.data.mannequin)
      setStatus('ready')
    } else {
      setLoadError(res.error.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // 처음 열 때 한 번 설정을 받아 옵니다.
    api.getSettings().then(applySettings)
  }, [applySettings])

  function retryLoad() {
    setStatus('loading')
    api.getSettings().then(applySettings)
  }

  // 시작하기 (API-SPEC §3)
  async function handleStart(choice) {
    setSaving(true)
    setSaveError(null)
    const res = await api.saveMannequin(choice)
    setSaving(false)
    if (res.result === 'ok') {
      setMannequin(res.data)
    } else {
      setSaveError(res.error.message)
    }
  }

  const firstRun = status === 'ready' && !mannequin
  const showMenu = status === 'ready' && mannequin

  return (
    <div className="app">
      {showMenu && <MenuBar active={activeMenu} onSelect={setActiveMenu} />}
      <main className={`stage${firstRun ? ' stage--dimmed' : ''}`}>
        <Room className="stage__room" />
        <Wardrobe className="stage__wardrobe" />
        {showMenu && <Mannequin className="stage__mannequin" {...mannequin} />}
        {status === 'error' && (
          <div className="stage__notice">
            <ErrorLine message={loadError} onRetry={retryLoad} />
          </div>
        )}
        {showMenu && activeMenu && <p className="stage__placeholder">준비 중인 화면이에요.</p>}
      </main>
      {firstRun && <MannequinPicker onStart={handleStart} saving={saving} error={saveError} />}
    </div>
  )
}

export default App
