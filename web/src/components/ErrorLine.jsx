import Button from './Button.jsx'

// 실패했을 때: 무엇이 안 됐는지 한 줄과 [다시 시도] (SCREEN-SPEC §2.7)
function ErrorLine({ message, onRetry }) {
  return (
    <div className="error-line" role="alert">
      <span>{message}</span>
      {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}

export default ErrorLine
