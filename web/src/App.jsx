import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import ClosetScreen from './components/ClosetScreen.jsx'
import ConfirmedScreen from './components/ConfirmedScreen.jsx'
import DiaryScreen from './components/DiaryScreen.jsx'
import DressUpScreen from './components/DressUpScreen.jsx'
import FavoritesScreen from './components/FavoritesScreen.jsx'
import ErrorLine from './components/ErrorLine.jsx'
import MannequinPicker from './components/MannequinPicker.jsx'
import HomeScreen from './components/HomeScreen.jsx'
import MenuBar from './components/MenuBar.jsx'
import Room from './components/Room.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import Toast from './components/Toast.jsx'
import Wardrobe from './components/Wardrobe.jsx'
import { useFitScale } from './useFitScale.js'

function App() {
  // loading: 설정을 받는 중, error: 받지 못함, ready: 받음
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [mannequin, setMannequin] = useState(null)
  const [regions, setRegions] = useState([])
  // 저장한 내 지역(없으면 null). 처음 화면 날씨가 씁니다. 설정에서 저장하면 바로 바뀝니다.
  const [homeRegion, setHomeRegion] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  // 확정한 뒤 화면 (SCREEN-SPEC §5.6). 메뉴를 누르면 사라집니다. 앱을 다시 켜면 처음 화면입니다.
  const [confirmed, setConfirmed] = useState(null)
  // 코디 일기의 "입혀 보기"로 새 옷 입기를 열 때 넘기는 것. 메뉴를 누르면 비웁니다.
  const [dressUpInit, setDressUpInit] = useState(null)
  // 입혀 보기를 할 때마다 새 옷 입기 화면을 처음부터 다시 그립니다.
  const [dressUpKey, setDressUpKey] = useState(0)
  // 설정을 열 때 처음 보일 쪽. 처음 화면 날씨 카드의 > 는 'region' (사람이 정함, 2026-10-22)
  const [settingsPage, setSettingsPage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [toast, setToast] = useState(null)
  const clearToast = useCallback(() => setToast(null), [])
  const scale = useFitScale()

  // 앱 열기 (API-SPEC §3)의 응답을 반영합니다.
  const applySettings = useCallback((res) => {
    if (res.result === 'ok') {
      setMannequin(res.data.mannequin)
      setRegions(res.data.regions)
      setHomeRegion(res.data.home_region ?? null)
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

  const goToCloset = useCallback(() => setActiveMenu('closet'), [])

  function selectMenu(key) {
    setConfirmed(null)
    setDressUpInit(null)
    setDressUpKey((k) => k + 1)
    setSettingsPage(null)
    setActiveMenu(key)
  }

  function openRegionSettings() {
    selectMenu('settings')
    setSettingsPage('region')
  }

  function openTryOn(data) {
    setDressUpInit(data)
    setDressUpKey((k) => k + 1)
    setActiveMenu('dressup')
  }

  // 확정하면 아무 메뉴도 선택되지 않은 확정한 뒤 화면이 됩니다. (사람이 정함, 2026-10-21)
  function handleConfirmed(data) {
    setActiveMenu(null)
    setConfirmed(data)
  }

  const firstRun = status === 'ready' && !mannequin
  const showMenu = status === 'ready' && mannequin
  // 옷장 화면에서는 옷장이 화면 전체로 커지고 마네킹은 숨깁니다. (SCREEN-SPEC §1.2)
  const closetOpen = showMenu && activeMenu === 'closet'
  // 설정 화면에서는 옷장과 마네킹을 숨기고, 마네킹 모양 미리보기만 보입니다. (SCREEN-SPEC §1.2)
  const settingsOpen = showMenu && activeMenu === 'settings'
  // 새 옷 입기에서는 커진 옷장과 조건 띠, 옷을 입히는 마네킹이 보입니다. (SCREEN-SPEC §1.2, §5)
  const dressUpOpen = showMenu && activeMenu === 'dressup'
  // 코디 일기에서는 일기장이 화면 전체로 펼쳐지고 옷장과 마네킹은 숨깁니다. (SCREEN-SPEC §1.2, §7)
  const diaryOpen = showMenu && activeMenu === 'diary'
  // 즐겨찾기에서는 옷걸이가 화면 전체로 커지고 옷장과 마네킹은 숨깁니다. (SCREEN-SPEC §1.2, §8)
  const favoritesOpen = showMenu && activeMenu === 'favorites'
  // 처음 화면: 메뉴를 아직 고르지 않았을 때 (SCREEN-SPEC §4). 캔버스 전체에 그림을 깔고 마네킹과 날씨 카드가 보입니다.
  const homeOpen = showMenu && !activeMenu && !confirmed
  // 시안을 옮긴 화면은 캔버스 전체에 그려지고, 아직 옮기지 않은 화면은 메뉴바 아래에 그려집니다.
  const redesigned = homeOpen || settingsOpen || diaryOpen || favoritesOpen || Boolean(confirmed)
  const fullScreen = homeOpen || closetOpen || settingsOpen || dressUpOpen || diaryOpen || favoritesOpen

  // 앱 전체를 시안(style/html)의 1536×1024 캔버스로 그리고 창 크기에 맞춰 줄입니다. (P-38, 사람이 정함 2026-10-22)
  // 아직 시안을 옮기지 않은 화면은 메뉴바 아래에, 처음 화면은 캔버스 전체에 그려집니다.
  return (
    <div className="app-frame">
      <div className="app-canvas" style={{ transform: `scale(${scale})` }}>
        {showMenu && <MenuBar active={activeMenu} onSelect={selectMenu} />}
        <main className={`stage${redesigned ? ' stage--full' : ''}${firstRun ? ' stage--dimmed' : ''}`}>
          {confirmed ? (
            <ConfirmedScreen confirmed={confirmed} mannequin={mannequin} />
          ) : (
            <>
              <Room className="stage__room" />
              {!fullScreen && <Wardrobe className="stage__wardrobe" />}
            </>
          )}
          {homeOpen && <HomeScreen mannequin={mannequin} homeRegion={homeRegion} onOpenRegion={openRegionSettings} />}
          {closetOpen && <ClosetScreen gender={mannequin.gender} showToast={setToast} />}
          {dressUpOpen && (
            <DressUpScreen
              key={dressUpKey}
              initial={dressUpInit}
              mannequin={mannequin}
              regions={regions}
              onNoClothes={goToCloset}
              onConfirmed={handleConfirmed}
              showToast={setToast}
            />
          )}
          {diaryOpen && <DiaryScreen onGoDressUp={() => selectMenu('dressup')} onTryOn={openTryOn} />}
          {favoritesOpen && <FavoritesScreen onTryOn={openTryOn} />}
          {settingsOpen && (
            <SettingsScreen
              mannequin={mannequin}
              initialPage={settingsPage}
              onMannequinSaved={setMannequin}
              onRegionSaved={setHomeRegion}
              showToast={setToast}
            />
          )}
          {status === 'error' && (
            <div className="stage__notice">
              <ErrorLine message={loadError} onRetry={retryLoad} />
            </div>
          )}
        </main>
        <Toast message={toast} onDone={clearToast} />
      </div>
      {/* 첫 실행 화면은 자체 캔버스가 있어 앱 캔버스 밖에 둡니다. */}
      {firstRun && <MannequinPicker onStart={handleStart} saving={saving} error={saveError} />}
    </div>
  )
}

export default App
