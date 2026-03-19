import styles from './Btn.module.css'

export default function Btn({
  gold,
  small,
  disabled,
  onClick,
  children,
  style,
  className = ''
}) {
  const classNames = [
    styles.btn,
    gold && styles.gold,
    small && styles.small,
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  )
}
