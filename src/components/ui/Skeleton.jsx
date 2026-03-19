import styles from './Skeleton.module.css'

/**
 * Skeleton loading placeholder
 * Use for content that's loading
 */
export default function Skeleton({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'rect' // rect | circle | text
}) {
  const style = {
    width: width || (variant === 'circle' ? height : '100%'),
    height: height || (variant === 'text' ? '1em' : 'auto'),
    borderRadius: borderRadius || (variant === 'circle' ? '50%' : undefined)
  }

  return (
    <div
      className={`${styles.skeleton} ${styles[variant]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Skeleton for document cards in DocList
 */
export function DocCardSkeleton() {
  return (
    <div className={styles.docCard}>
      <Skeleton height={16} width="70%" />
      <Skeleton height={12} width="90%" />
      <Skeleton height={12} width="50%" />
      <div className={styles.docCardFooter}>
        <Skeleton height={10} width={60} />
        <Skeleton height={10} width={40} />
      </div>
    </div>
  )
}

/**
 * Skeleton for folder items in FolderTree
 */
export function FolderSkeleton() {
  return (
    <div className={styles.folder}>
      <Skeleton width={16} height={16} />
      <Skeleton height={14} width="60%" />
    </div>
  )
}
