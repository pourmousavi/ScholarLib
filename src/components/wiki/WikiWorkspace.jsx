import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useStorageStore } from '../../store/storageStore'
import { ObsidianExporter } from '../../services/wiki'
import Inbox from './Inbox'
import QualityDashboard from './QualityDashboard'
import GrantPanel from './grants/GrantPanel'
import QuestionInbox from './questions/QuestionInbox'
import BenchmarkRunner from './benchmark/BenchmarkRunner'
import styles from './Wiki.module.css'

const TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'quality', label: 'Quality' },
  { id: 'grants', label: 'Grants' },
  { id: 'questions', label: 'Questions' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'obsidian', label: 'Obsidian' },
]

export default function WikiWorkspace() {
  const [exportStatus, setExportStatus] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const adapter = useStorageStore((s) => s.adapter)
  const previousPanel = useUIStore((s) => s.previousPanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const activeTab = useUIStore((s) => s.wikiWorkspaceTab)
  const setActiveTab = useUIStore((s) => s.setWikiWorkspaceTab)

  const closeWorkspace = () => {
    setActivePanel(previousPanel && previousPanel !== 'wiki' ? previousPanel : 'pdf')
  }

  const runExport = async () => {
    if (!adapter || isExporting) return
    setIsExporting(true)
    setExportStatus(null)
    try {
      const manifest = await new ObsidianExporter({ adapter }).export()
      setExportStatus({ ok: true, manifest })
    } catch (error) {
      setExportStatus({ ok: false, message: error.message || 'Export failed' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceNav}>
        <div className={styles.workspaceTabs}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.workspaceTab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.workspaceClose}
          onClick={closeWorkspace}
          title="Close Wiki"
          aria-label="Close Wiki"
        >
          ×
        </button>
      </div>
      <div className={styles.workspaceBody}>
        {activeTab === 'inbox' && <Inbox />}
        {activeTab === 'quality' && <QualityDashboard adapter={adapter} />}
        {activeTab === 'grants' && <GrantPanel adapter={adapter} />}
        {activeTab === 'questions' && <QuestionInbox adapter={adapter} />}
        {activeTab === 'benchmark' && <BenchmarkRunner adapter={adapter} />}
        {activeTab === 'obsidian' && (
          <div className={styles.inbox}>
            <div className={styles.header}>
              <div>
                <h2>Obsidian Export</h2>
                <p>Generate the read-only `_wiki_export_obsidian/` mirror.</p>
              </div>
              <button className={styles.primaryBtn} type="button" onClick={runExport} disabled={!adapter || isExporting}>
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
            {exportStatus && (
              <div className={styles.empty}>
                {exportStatus.ok
                  ? `Exported ${exportStatus.manifest.page_count} pages and ${exportStatus.manifest.files.length} files.`
                  : exportStatus.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
