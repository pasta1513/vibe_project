import { SLOT_LABEL } from '../labels.js'
import Button from './Button.jsx'
import Mannequin from './Mannequin.jsx'
import { NoteToggle, Stars } from './ScoreCard.jsx'

// 추천 보기 (SCREEN-SPEC §5.3): 추천 코디를 입은 마네킹이 가로로 최대 3개 놓입니다.
// recommendation: API-SPEC §5.2 추천받기의 받는 것 { outfits, fewer_than_three, insufficient }
// imageOf: 옷 번호 → 2D 이미지 주소

// 받침이 있으면 "을", 없으면 "를"
function objectParticle(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '를'
  return (last - 0xac00) % 28 === 0 ? '를' : '을'
}

// 옷이 부족할 때 먼저 등록할 구분. 상의·하의는 원피스로도 채울 수 있다고 함께 적습니다. (제안, 2026-10-21)
// 예: "하의(또는 원피스)를", "신발을", "상의, 하의(또는 원피스), 신발을"
function missingText({ missing, dress_alternative: dressAlternative }) {
  const upper = missing.filter((slot) => slot === 'top' || slot === 'bottom').map((s) => SLOT_LABEL[s])
  const parts = []
  if (upper.length > 0) parts.push(`${upper.join(', ')}${dressAlternative ? '(또는 원피스)' : ''}`)
  if (missing.includes('shoes')) parts.push(SLOT_LABEL.shoes)
  const lastWord = missing.includes('shoes') ? SLOT_LABEL.shoes : dressAlternative ? '원피스' : upper[upper.length - 1]
  return `${parts.join(', ')}${objectParticle(lastWord)}`
}

function RecommendCard({ item, imageOf, mannequin, index, onTryOn }) {
  const { outfit } = item
  const worn = Object.fromEntries(
    Object.entries(outfit).map(([slot, id]) => [slot, id ? imageOf[id] : null]),
  )
  // 아우터가 없는 코디는 아우터 칸이 처음부터 "입지 않음"입니다. (PRD §5 추천 결과)
  if (!outfit.outer) worn.outer = 'none'
  const favorite = item.favorite_id != null

  return (
    <article className="rec-card" aria-label={`추천 ${index + 1}`}>
      {/* 즐겨찾기 별은 P-21에서 누를 수 있게 합니다. (사람이 정함, 2026-10-21) */}
      <button
        type="button"
        className={`rec-card__star${favorite ? ' rec-card__star--on' : ''}`}
        aria-label={favorite ? '즐겨찾기에 있음 (준비 중)' : '즐겨찾기에 넣기 (준비 중)'}
        disabled
      >
        {favorite ? '★' : '☆'}
      </button>
      <Mannequin className="rec-card__mannequin" {...mannequin} outfit={worn} />
      <Stars score={item.score} />
      <NoteToggle result={item} />
      <div className="rec-card__actions">
        <Button onClick={() => onTryOn(index)}>입혀 보기</Button>
        {/* 확정하기는 P-19에서 붙입니다. (사람이 정함, 2026-10-21) */}
        <Button variant="primary" disabled title="준비 중이에요">
          확정하기
        </Button>
      </div>
    </article>
  )
}

function RecommendList({ recommendation, imageOf, mannequin, onTryOn, onGoCloset }) {
  if (recommendation.insufficient) {
    return (
      <div className="rec-list__notice">
        <p>
          코디를 만들 옷이 부족해요. 먼저 {missingText(recommendation.insufficient)} 등록해 주세요.
        </p>
        <Button onClick={onGoCloset}>옷장으로 가기</Button>
      </div>
    )
  }

  return (
    <div className="rec-list">
      <div className="rec-list__cards">
        {recommendation.outfits.map((item, index) => (
          <RecommendCard
            key={index}
            item={item}
            index={index}
            imageOf={imageOf}
            mannequin={mannequin}
            onTryOn={onTryOn}
          />
        ))}
      </div>
      {recommendation.fewer_than_three && (
        <p className="sub-text">옷을 더 등록하면 추천이 다양해져요.</p>
      )}
      <p className="sub-text">확정하기와 즐겨찾기는 준비 중이에요.</p>
    </div>
  )
}

export default RecommendList
