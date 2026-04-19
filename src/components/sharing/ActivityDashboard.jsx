import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { workerClient } from '../../services/sharing/WorkerClient'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './ActivityDashboard.module.css'

const ACTION_LABELS = {
  view: 'viewed',
  download: 'downloaded',
  annotate: 'annotated',
  upload: 'uploaded'
}

export default function ActivityDashboard({ onClose }) {
  const [events, setEvents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState({
    folder: 'all',
    person: 'all',
    action: 'all'
  })

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)

  const { showToast } = useToast()

  const selectedFolder = folders.find(f => f.id === selectedFolderId)
  const folderPath = selectedFolder ? `/${selectedFolder.slug}` : ''

  // Load activity on mount
  useEffect(() => {
    const loadActivity = async () => {
      if (!workerClient.isConfigured()) {
        setIsLoading(false)
        return
      }

      try {
        // Load activity for current folder (or all accessible folders)
        // TODO: Get actual Box token from storage adapter
        const boxToken = localStorage.getItem('sv_box_access') ? atob(localStorage.getItem('sv_box_access')) : null
        const result = await workerClient.getActivity(folderPath, boxToken, null, 100)
        setEvents(result.events || [])
      } catch (error) {
        console.error('Failed to load activity:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadActivity()
  }, [folderPath])

  const formatTimestamp = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getDocTitle = (docId) => {
    const doc = documents[docId]
    return doc?.metadata?.title || doc?.filename || docId || 'Unknown document'
  }

  const getPersonName = (email) => {
    const name = email.split('@')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  // Get unique values for filters
  const uniquePersons = [...new Set(events.map(e => e.email))]
  const uniqueActions = [...new Set(events.map(e => e.action))]

  // Apply filters
  const filteredEvents = events.filter(e => {
    if (filter.person !== 'all' && e.email !== filter.person) return false
    if (filter.action !== 'all' && e.action !== filter.action) return false
    return true
  })

  // Calculate stats per person
  const personStats = {}
  events.forEach(e => {
    if (!personStats[e.email]) {
      personStats[e.email] = { total: 0, lastWeek: 0 }
    }
    personStats[e.email].total++

    const eventDate = new Date(e.timestamp)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    if (eventDate > weekAgo) {
      personStats[e.email].lastWeek++
    }
  })

  const maxWeeklyAccess = Math.max(...Object.values(personStats).map(s => s.lastWeek), 1)

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Person', 'Action', 'Document']
    const rows = filteredEvents.map(e => [
      e.timestamp,
      e.email,
      e.action,
      getDocTitle(e.doc_id)
    ])

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)

    showToast({ message: 'Activity exported to CSV', type: 'success' })
  }

  return (
    <Modal onClose={onClose} width={900}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Activity Dashboard</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {!workerClient.isConfigured() ? (
          <div className={styles.notConfigured}>
            <p>Activity tracking not configured.</p>
            <p className={styles.hint}>Deploy the Cloudflare Worker and set VITE_WORKER_URL to enable activity tracking.</p>
          </div>
        ) : isLoading ? (
          <div className={styles.loading}>Loading activity...</div>
        ) : (
          <>
            {/* Stats */}
            <div className={styles.statsSection}>
              <h3 className={styles.sectionTitle}>Access this week</h3>
              <div className={styles.statsGrid}>
                {Object.entries(personStats).map(([email, stats]) => (
                  <div key={email} className={styles.statCard}>
                    <div className={styles.statPerson}>{getPersonName(email)}</div>
                    <div className={styles.statBar}>
                      <div
                        className={styles.statBarFill}
                        style={{ width: `${(stats.lastWeek / maxWeeklyAccess) * 100}%` }}
                      />
                    </div>
                    <div className={styles.statCount}>{stats.lastWeek} accesses</div>
                  </div>
                ))}
                {Object.keys(personStats).length === 0 && (
                  <div className={styles.empty}>No activity recorded</div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
              <select
                value={filter.person}
                onChange={(e) => setFilter(prev => ({ ...prev, person: e.target.value }))}
              >
                <option value="all">All people</option>
                {uniquePersons.map(p => (
                  <option key={p} value={p}>{getPersonName(p)}</option>
                ))}
              </select>

              <select
                value={filter.action}
                onChange={(e) => setFilter(prev => ({ ...prev, action: e.target.value }))}
              >
                <option value="all">All actions</option>
                {uniqueActions.map(a => (
                  <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
                ))}
              </select>

              <button className={styles.exportBtn} onClick={handleExportCSV}>
                Export CSV
              </button>
            </div>

            {/* Timeline */}
            <div className={styles.timeline}>
              <h3 className={styles.sectionTitle}>Recent activity</h3>
              {filteredEvents.length === 0 ? (
                <div className={styles.empty}>No activity to show</div>
              ) : (
                <div className={styles.eventList}>
                  {filteredEvents.map((event, i) => (
                    <div key={i} className={styles.event}>
                      <div className={styles.eventDot} />
                      <div className={styles.eventContent}>
                        <span className={styles.eventPerson}>{getPersonName(event.email)}</span>
                        <span className={styles.eventAction}> {ACTION_LABELS[event.action] || event.action} </span>
                        <span className={styles.eventDoc}>{getDocTitle(event.doc_id)}</span>
                      </div>
                      <div className={styles.eventTime}>{formatTimestamp(event.timestamp)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
