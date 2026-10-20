// 서버 요청 도구. 응답의 공통 모양(API-SPEC §2.1)을 그대로 돌려줍니다.
//   { result: 'ok', data } | { result: 'confirm', confirm } | { result: 'error', error: { kind, message } }

// 내 PC 서버의 일반 요청은 5초를 넘으면 실패로 봅니다. (API-SPEC §2.3)
const DEFAULT_TIMEOUT_MS = 5000

function fail(kind, message) {
  return { result: 'error', error: { kind, message } }
}

export async function request(method, path, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    let json
    try {
      json = await res.json()
    } catch {
      return fail('server_unreachable', '서버에 연결하지 못했어요.')
    }
    if (json && ['ok', 'confirm', 'error'].includes(json.result)) return json
    return fail('bad_response', '서버의 답을 읽지 못했어요.')
  } catch (err) {
    if (err.name === 'AbortError') return fail('timeout', '서버가 너무 오래 걸려요.')
    return fail('server_unreachable', '서버에 연결하지 못했어요.')
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  getSettings: () => request('GET', '/api/settings'),
  saveMannequin: (mannequin) => request('PUT', '/api/settings/mannequin', mannequin),
}
