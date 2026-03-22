import styles from './TagColorPicker.module.css'

const PRESET_COLORS = [
  '#4A90D9', '#E85D75', '#50C878', '#9B59B6',
  '#F39C12', '#1ABC9C', '#E67E22', '#3498DB',
  '#2ECC71', '#E74C3C', '#95A5A6', '#34495E',
]

export default function TagColorPicker({ value, onChange }) {
  return (
    <div className={styles.container}>
      <div className={styles.presets}>
        {PRESET_COLORS.map(color => (
          <button
            key={color}
            type="button"
            className={`${styles.colorBtn} ${value === color ? styles.selected : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
      <div className={styles.custom}>
        <label className={styles.customLabel}>Custom:</label>
        <input
          type="color"
          value={value || '#4A90D9'}
          onChange={e => onChange(e.target.value)}
          className={styles.colorInput}
        />
      </div>
    </div>
  )
}
