// 마네킹의 몸과 기본 잠옷 (2026-10-23, 사람이 정함)
// moire 프로젝트(moire-source-v15)의 캐릭터 코드를 그대로 가져왔습니다.
// 좌표는 그 프로젝트의 viewBox `0 0 240 360` 그대로이고, Mannequin.jsx가 transform 하나로 위치와 크기를 맞춥니다.
// - BODY_MARKUP: `public/avatars/body.svg`에서 그림자와 머리카락을 뺀 몸(목, 팔과 손, 다리, 맨발, 속옷).
//   얼굴 그림(PNG)과 이어지도록 피부색만 바꿨습니다.
// - pajamaMarkup: `src/lib/pajamas.ts` 그대로 (TypeScript 형식 표시만 뺌)

const SKIN = '#FDE6D8'
const SKIN_LINE = '#EFA48A'

export const BODY_MARKUP = `<path d="M108 92 L108 111 L96 117 L91 194 L88 230 L88 313 L108 313 L120 224 L132 313 L152 313 L152 230 L149 194 L144 117 L132 111 L132 92" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1"/><path d="M95 117 Q83 115 79 134 L64 188 L61 199 Q58 203 59 208 L60 214 Q61 217 63 215 L63 210 L64 217 Q66 219 67 216 L67 210 L69 216 Q71 218 72 214 L72 207 L74 210 Q77 211 77 207 L76 201 L78 197 L97 152 M145 117 Q157 115 161 134 L176 188 L179 199 Q182 203 181 208 L180 214 Q179 217 177 215 L177 210 L176 217 Q174 219 173 216 L173 210 L171 216 Q169 218 168 214 L168 207 L166 210 Q163 211 163 207 L164 201 L162 197 L143 152" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1"/><path d="M91 143 L149 143 L148 194 L92 194Z" fill="#eee8dc"/><path d="M91 192 L149 192 L150 222 L121 220 L90 222Z" fill="#d4cbbb"/><g id="bare-feet" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1" stroke-linejoin="round"><path d="M88 306 L108 306 L108 319 Q110 323 106 324 L82 324 Q78 324 80 320 Q82 317 88 315Z"/><path d="M132 306 L152 306 L152 315 Q158 317 160 320 Q162 324 158 324 L134 324 Q130 323 132 319Z"/></g><g fill="none" stroke="${SKIN_LINE}" stroke-width=".7" stroke-linecap="round" opacity=".7"><path d="M85 320 L85 323 M89 320 L89 323 M93 321 L93 323 M147 321 L147 323 M151 320 L151 323 M155 320 L155 323 M65 202 Q68 201 71 204 M169 204 Q172 201 175 202"/></g>`

// Separate default top/bottom layers so real garments replace each part cleanly.
export function pajamaMarkup(part,unique){
 const id='pajama-'+unique.replace(/[^a-z0-9_-]/gi,'');
 const defs=`<defs><pattern id="${id}" width="13" height="13" patternUnits="userSpaceOnUse"><rect width="13" height="13" fill="#b5d9ee"/><circle cx="3.5" cy="3.5" r="1.65" fill="#fffaf3"/><circle cx="10" cy="10" r="1.65" fill="#fffaf3"/></pattern></defs>`;
 const outline='stroke="#7ea7bd" stroke-width="1.1" stroke-linejoin="round"';
 if(part==='하의')return `${defs}<g data-default="pajama-bottom"><path d="M90 185 Q120 191 150 185 L153 223 L154 310 L128 310 L120 226 L112 310 L86 310 L87 223Z" fill="url(#${id})" ${outline}/><path d="M87 302 L112 302 L112 310 L86 310Z M128 302 L154 302 L154 310 L128 310Z" fill="#d6eaf5" ${outline}/><path d="M90 197 Q120 201 150 197 M120 200 L120 225" fill="none" ${outline}/></g>`;
 return `${defs}<g data-default="pajama-top"><path d="M99 109 L82 117 L61 188 L78 193 L94 148 L89 199 Q120 205 151 199 L146 148 L162 193 L179 188 L158 117 L141 109 L120 120Z" fill="url(#${id})" ${outline}/><path d="M100 108 L120 120 L108 133 L96 115Z M140 108 L120 120 L132 133 L144 115Z M63 180 L80 185 L78 193 L61 188Z M160 185 L177 180 L179 188 L162 193Z" fill="#d6eaf5" ${outline}/><path d="M120 123 L120 201 M132 143 L145 143 L145 157 Q138 161 132 157Z" fill="none" ${outline}/><g fill="#fffaf3" stroke="#7ea7bd" stroke-width=".6"><circle cx="123" cy="141" r="1.8"/><circle cx="123" cy="160" r="1.8"/><circle cx="123" cy="179" r="1.8"/></g></g>`;
}
