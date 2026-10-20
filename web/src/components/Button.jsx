// 버튼 세 종류 (DESIGN §4.2): primary(코랄, 한 화면에 하나), danger(빨강), 보통
function Button({ variant, className = '', ...props }) {
  const variantClass = variant ? ` btn--${variant}` : ''
  return <button type="button" className={`btn${variantClass} ${className}`.trim()} {...props} />
}

export default Button
