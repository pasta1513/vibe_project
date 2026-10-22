import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, subjectParticle } from '../labels.js'
import Button from './Button.jsx'
import ClothingDetailDialog from './ClothingDetailDialog.jsx'
import ClothingRegisterDialog from './ClothingRegisterDialog.jsx'
import ErrorLine from './ErrorLine.jsx'

// 옷장 (옷 관리): 옷장이 화면 전체로 커집니다. (SCREEN-SPEC §6.1)
function ClosetScreen({ mannequin, outfitTable, showToast }) {
  const [clothes, setClothes] = useState(null)
  const [keywords, setKeywords] = useState(null)
  const [error, setError] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const applyLoaded = useCallback(([clothesRes, keywordsRes]) => {
    const failed = [clothesRes, keywordsRes].find((r) => r.result !== 'ok')
    if (failed) {
      setError(failed.error.message)
      return
    }
    setError(null)
    setClothes(clothesRes.data)
    setKeywords(keywordsRes.data)
  }, [])

  const load = useCallback(
    () => Promise.all([api.getClothes(), api.getKeywords()]).then(applyLoaded),
    [applyLoaded],
  )

  useEffect(() => {
    load()
  }, [load])

  function handleRegistered() {
    setRegistering(false)
    load()
    showToast('등록되었습니다.')
  }

  function handleDeleted() {
    setDetailId(null)
    load()
    showToast('지웠습니다.')
  }

  const total = clothes ? CATEGORIES.reduce((n, c) => n + clothes[c.code].length, 0) : 0
  const registerButton = <Button onClick={() => setRegistering(true)}>옷 등록</Button>

  return (
    <section className="closet" aria-label="옷장">
      {error && <ErrorLine message={error} onRetry={load} />}
      {clothes && total === 0 && (
        <div className="closet__empty">
          <p>아직 등록한 옷이 없어요.</p>
          {registerButton}
        </div>
      )}
      {clothes && total > 0 && (
        <>
          <div className="closet__toolbar">{registerButton}</div>
          <div className="closet__sections">
            {CATEGORIES.map((category) => (
              <div key={category.code} className="closet__section">
                <h3 className="closet__heading">{category.label}</h3>
                {clothes[category.code].length === 0 ? (
                  <div className="closet__section-empty">
                    <p>
                      아직 등록한 {category.label}
                      {subjectParticle(category.label)} 없어요.
                    </p>
                    {registerButton}
                  </div>
                ) : (
                  <div className="closet__grid">
                    {clothes[category.code].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="closet__item"
                        onClick={() => setDetailId(item.id)}
                      >
                        <img src={item.image_url} alt={`${category.label} ${item.id}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {registering && keywords && (
        <ClothingRegisterDialog
          keywords={keywords}
          mannequin={mannequin}
          outfitTable={outfitTable}
          onClose={() => {
            // 등록 창에서 [+ 더하기]로 더한 단어가 옷 상세에도 보이도록 목록을 다시 받습니다.
            setRegistering(false)
            load()
          }}
          onRegistered={handleRegistered}
        />
      )}
      {detailId !== null && keywords && (
        <ClothingDetailDialog
          clothingId={detailId}
          keywords={keywords}
          onClose={() => setDetailId(null)}
          onDeleted={handleDeleted}
          onSaved={() => showToast('저장되었습니다.')}
        />
      )}
    </section>
  )
}

export default ClosetScreen
