import { SLOT_LABEL } from '../labels.js'
import { api } from '../api.js'
import Button from './Button.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import Mannequin from './Mannequin.jsx'
import { NoteToggle, Stars } from './ScoreCard.jsx'

// 추천 보기 (SCREEN-SPEC §5.3): 추천 코디를 입은 마네킹이 가로로 최대 3개 놓입니다.
// recommendation: API-SPEC §5.2 추천받기의 받는 것 { outfits, fewer_than_three, insufficient }
// clothingOf: 옷 번호 → 옷 한 벌 정보 (마네킹에 입힘, D-016)

// 받침이 있으면 "을", 없으면 "를"
function objectParticle(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '를'
  return (last - 0xac00) % 28 === 0 ? '를' : '을'
}

// 옷이 부족할 때 먼저 등록할 구분. 상의·하의는 원피스로도 채울 수 있다고 함께 적습니다. (제안, 2026-10-21)
// 예: "하의(또는 원피스)를", "신발을", "상의, 하의(또는 원피스), 신발을"
export function missingText({ missing, dress_alternative: dressAlternative }) {
  const upper = missing.filter((slot) => slot === 'top' || slot === 'bottom').map((s) => SLOT_LABEL[s])
  const parts = []
  if (upper.length > 0) parts.push(`${upper.join(', ')}${dressAlternative ? '(또는 원피스)' : ''}`)
  if (missing.includes('shoes')) parts.push(SLOT_LABEL.shoes)
  const lastWord = missing.includes('shoes') ? SLOT_LABEL.shoes : dressAlternative ? '원피스' : upper[upper.length - 1]
  return `${parts.join(', ')}${objectParticle(lastWord)}`
}

function RecommendCard({ item, clothingOf, mannequin, index, tagId, onTryOn, onConfirm, confirming, onFavorite }) {
  const { outfit } = item
  const worn = Object.fromEntries(
    Object.entries(outfit).map(([slot, id]) => [slot, id ? clothingOf[id] : null]),
  )
  // 아우터가 없는 코디는 아우터 칸이 처음부터 "입지 않음"입니다. (PRD §5 추천 결과)
  if (!outfit.outer) worn.outer = 'none'

  return (
    <article className="rec-card" aria-label={`추천 ${index + 1}`}>
      <FavoriteStar
        favoriteId={item.favorite_id}
        add={() => api.addFavorite({ outfit, tag_id: tagId })}
        onChange={(id) => onFavorite(outfit, id)}
      />
      <Mannequin className="rec-card__mannequin" {...mannequin} outfit={worn} />
      <Stars score={item.score} />
      <NoteToggle result={item} />
      <div className="rec-card__actions">
        <Button onClick={() => onTryOn(index)}>입혀 보기</Button>
        {/* 마네킹을 거치지 않고 바로 코디 일기에 남깁니다. 이유가 남습니다. (PRD §5) */}
        <Button variant="primary" disabled={confirming} onClick={() => onConfirm(index)}>
          확정하기
        </Button>
      </div>
    </article>
  )
}

function RecommendList({
  recommendation,
  clothingOf,
  mannequin,
  onTryOn,
  tagId,
  onConfirm,
  confirming,
  onFavorite,
  onGoCloset,
}) {
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
            clothingOf={clothingOf}
            mannequin={mannequin}
            onTryOn={onTryOn}
            tagId={tagId}
            onConfirm={onConfirm}
            confirming={confirming}
            onFavorite={onFavorite}
          />
        ))}
      </div>
      {recommendation.fewer_than_three && (
        <p className="sub-text">
          옷이 부족해 {recommendation.outfits.length}벌만 추천했어요. 옷을 더 등록하면 추천이 다양해져요.
        </p>
      )}
    </div>
  )
}

export default RecommendList
