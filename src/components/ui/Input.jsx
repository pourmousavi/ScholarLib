import styles from './Input.module.css'

export default function Input({
  multiline,
  rows = 3,
  value,
  onChange,
  placeholder,
  type = 'text',
  style,
  className = '',
  ...props
}) {
  const classNames = `${styles.input} ${className}`

  if (multiline) {
    return (
      <textarea
        className={classNames}
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={style}
        {...props}
      />
    )
  }

  return (
    <input
      className={classNames}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={style}
      {...props}
    />
  )
}
