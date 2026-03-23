import styles from './TagColorPicker.module.css'

// Collection colors - more saturated/vibrant than tag colors
const COLLECTION_COLORS = [
  '#7C3AED', // Violet
  '#0EA5E9', // Sky
  '#10B981', // Emerald
  '#F97316', // Orange
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#14B8A6', // Teal
]

export default function CollectionColorPicker({ value, onChange }) {
  return (
    <div className={styles.container}>
      <div className={styles.presets}>
        {COLLECTION_COLORS.map(color => (
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
          value={value || '#7C3AED'}
          onChange={e => onChange(e.target.value)}
          className={styles.colorInput}
        />
      </div>
    </div>
  )
}
