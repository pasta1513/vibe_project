import Button from './Button.jsx'

// 확인 질문: 버튼은 오른쪽 아래에 [취소] → [실행] 순서 (DESIGN §4.3)
// danger: 되돌릴 수 없는 행동([지우기], [바꾸기])이면 빨강 버튼 (DESIGN §4.2)
function ConfirmDialog({ message, confirmLabel, danger = false, onCancel, onConfirm }) {
  return (
    <div className="dialog-backdrop dialog-backdrop--top">
      <div className="dialog dialog--small" role="alertdialog" aria-modal="true">
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <Button onClick={onCancel}>취소</Button>
          <Button variant={danger ? 'danger' : undefined} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
