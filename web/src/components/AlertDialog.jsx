import Button from './Button.jsx'

// 경고창: 문장과 [확인] 하나 (SCREEN-SPEC §2.6)
function AlertDialog({ message, onClose }) {
  return (
    <div className="dialog-backdrop dialog-backdrop--top">
      <div className="dialog dialog--small" role="alertdialog" aria-modal="true">
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <Button onClick={onClose}>확인</Button>
        </div>
      </div>
    </div>
  )
}

export default AlertDialog
