import { useState, useCallback, useRef } from 'react'
import { Modal, Btn, Spinner } from '../ui'
import { useStorageStore } from '../../store/storageStore'
import { useLibraryStore } from '../../store/libraryStore'
import {
  IMPORT_SOURCES,
  IMPORT_STATES,
  parseImportFile,
  createFolderMapping,
  createTagMapping,
  importDocuments,
  getImportStats
} from '../../services/import'
import styles from './ImportWizard.module.css'

/**
 * ImportWizard - Multi-step wizard for importing library data
 *
 * Steps:
 * 1. Select source type and upload file
 * 2. Scan and preview results
 * 3. Map collections to folders
 * 4. Review duplicates
 * 5. Import progress
 * 6. Complete summary
 */
export default function ImportWizard({ onClose }) {
  const adapter = useStorageStore((s) => s.adapter)
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)

  const [step, setStep] = useState(1)
  const [state, setState] = useState(IMPORT_STATES.IDLE)
  const [error, setError] = useState(null)

  // Step 1: Source selection
  const [sourceType, setSourceType] = useState(IMPORT_SOURCES.ZOTERO_RDF)
  const [rdfFile, setRdfFile] = useState(null)
  const [attachmentsFolder, setAttachmentsFolder] = useState(null)

  // Step 2: Parsed data
  const [parsedData, setParsedData] = useState(null)
  const [importStats, setImportStats] = useState(null)

  // Step 3: Folder mapping
  const [folderMapping, setFolderMapping] = useState({})
  const [defaultFolderId, setDefaultFolderId] = useState('root')

  // Step 4: Duplicate handling
  const [duplicateResolutions, setDuplicateResolutions] = useState({})

  // Step 5: Import options
  const [importOptions, setImportOptions] = useState({
    importFolders: true,
    importTags: true,
    importNotes: true,
    extractAnnotations: true
  })

  // Step 5: Progress
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  // Step 6: Results
  const [results, setResults] = useState(null)

  // File input refs
  const rdfInputRef = useRef(null)
  const attachmentsInputRef = useRef(null)

  // Step 1: Handle file selection
  const handleFileSelect = useCallback(async (file) => {
    setRdfFile(file)
    setError(null)
  }, [])

  const handleAttachmentsSelect = useCallback((files) => {
    setAttachmentsFolder(files)
  }, [])

  // Step 1 -> 2: Parse file
  const handleParse = useCallback(async () => {
    if (!rdfFile) return

    setState(IMPORT_STATES.PARSING)
    setError(null)

    try {
      const content = await rdfFile.text()
      const parsed = await parseImportFile(sourceType, content)
      setParsedData(parsed)

      // Calculate stats including duplicates
      const stats = getImportStats(parsed, documents)
      setImportStats(stats)

      // Initialize folder mapping (all to default)
      const initialMapping = {}
      for (const coll of parsed.collections) {
        initialMapping[coll.id] = defaultFolderId
      }
      setFolderMapping(initialMapping)

      // Initialize duplicate resolutions (all to skip initially)
      const initialResolutions = {}
      for (const dup of stats.duplicates) {
        initialResolutions[dup.index] = { action: 'skip' }
      }
      setDuplicateResolutions(initialResolutions)

      setState(IMPORT_STATES.READY)
      setStep(2)
    } catch (err) {
      setError(err.message)
      setState(IMPORT_STATES.ERROR)
    }
  }, [rdfFile, sourceType, documents, defaultFolderId])

  // Step 4 -> 5: Start import
  const handleStartImport = useCallback(async () => {
    if (!parsedData) {
      setError('No data to import')
      return
    }
    if (!adapter) {
      setError('Storage not connected. Please connect to Box or Dropbox first.')
      return
    }

    setState(IMPORT_STATES.IMPORTING)
    setStep(5)
    setError(null)

    // Set initial progress immediately so UI shows total
    setProgress({
      current: 0,
      total: parsedData.items.length,
      stage: 'preparing',
      item: 'Preparing import...'
    })

    try {
      // Create folder structure if enabled
      let finalFolderMapping = folderMapping
      if (importOptions.importFolders && parsedData.collections.length > 0) {
        setProgress(prev => ({ ...prev, stage: 'folders', item: 'Creating folders...' }))
        finalFolderMapping = createFolderMapping(parsedData.collections, defaultFolderId)
        setFolderMapping(finalFolderMapping)
      }

      // Create tags if enabled
      let tagMapping = {}
      if (importOptions.importTags && parsedData.tags.length > 0) {
        setProgress(prev => ({ ...prev, stage: 'tags', item: 'Registering tags...' }))
        tagMapping = createTagMapping(parsedData.tags)
      }

      // Run import
      const importResults = await importDocuments(parsedData, {
        adapter,
        folderMapping: finalFolderMapping,
        tagMapping,
        duplicateResolutions,
        attachmentsFolder,
        extractAnnotations: importOptions.extractAnnotations,
        importNotes: importOptions.importNotes,
        defaultFolderId
      }, (progress) => {
        setProgress({
          current: progress.current || 0,
          total: progress.total || parsedData.items.length,
          stage: progress.stage,
          item: progress.item
        })

        if (progress.stage === 'complete') {
          setResults(progress.results)
          setState(IMPORT_STATES.COMPLETE)
          setStep(6)
        }
      })

      setResults(importResults)
      setState(IMPORT_STATES.COMPLETE)
      setStep(6)
    } catch (err) {
      setError(err.message)
      setState(IMPORT_STATES.ERROR)
    }
  }, [parsedData, adapter, folderMapping, importOptions, duplicateResolutions, attachmentsFolder, defaultFolderId])

  // Duplicate resolution handler
  const handleDuplicateResolution = useCallback((index, action, existingDocId) => {
    setDuplicateResolutions(prev => ({
      ...prev,
      [index]: { action, existingDocId }
    }))
  }, [])

  // Render step content
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Step1_SelectSource
            sourceType={sourceType}
            setSourceType={setSourceType}
            rdfFile={rdfFile}
            onFileSelect={handleFileSelect}
            attachmentsFolder={attachmentsFolder}
            onAttachmentsSelect={handleAttachmentsSelect}
            rdfInputRef={rdfInputRef}
            attachmentsInputRef={attachmentsInputRef}
            state={state}
            error={error}
            onNext={handleParse}
          />
        )

      case 2:
        return (
          <Step2_ScanResults
            parsedData={parsedData}
            importStats={importStats}
            importOptions={importOptions}
            setImportOptions={setImportOptions}
            onBack={() => setStep(1)}
            onNext={() => setStep(importStats?.duplicates?.length > 0 ? 4 : 3)}
          />
        )

      case 3:
        return (
          <Step3_MapFolders
            collections={parsedData?.collections || []}
            folders={folders}
            folderMapping={folderMapping}
            setFolderMapping={setFolderMapping}
            defaultFolderId={defaultFolderId}
            setDefaultFolderId={setDefaultFolderId}
            onBack={() => setStep(2)}
            onNext={importStats?.duplicates?.length > 0 ? () => setStep(4) : handleStartImport}
          />
        )

      case 4:
        return (
          <Step4_ReviewDuplicates
            duplicates={importStats?.duplicates || []}
            resolutions={duplicateResolutions}
            onResolve={handleDuplicateResolution}
            onBack={() => setStep(3)}
            onNext={handleStartImport}
          />
        )

      case 5:
        return (
          <Step5_ImportProgress
            progress={progress}
            state={state}
            error={error}
          />
        )

      case 6:
        return (
          <Step6_Complete
            results={results}
            onClose={onClose}
          />
        )

      default:
        return null
    }
  }

  return (
    <Modal onClose={onClose} width={640} title="Import Library">
      <div className={styles.wizard}>
        {/* Progress indicator */}
        <div className={styles.steps}>
          {[1, 2, 3, 4, 5, 6].map(s => (
            <div
              key={s}
              className={`${styles.stepDot} ${s === step ? styles.active : ''} ${s < step ? styles.completed : ''}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className={styles.content}>
          {renderStep()}
        </div>
      </div>
    </Modal>
  )
}

// Step 1: Select Source
function Step1_SelectSource({
  sourceType,
  setSourceType,
  rdfFile,
  onFileSelect,
  attachmentsFolder,
  onAttachmentsSelect,
  rdfInputRef,
  attachmentsInputRef,
  state,
  error,
  onNext
}) {
  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Select Import Source</h3>

      <div className={styles.sourceOptions}>
        <label className={`${styles.sourceOption} ${sourceType === IMPORT_SOURCES.ZOTERO_RDF ? styles.selected : ''}`}>
          <input
            type="radio"
            name="source"
            value={IMPORT_SOURCES.ZOTERO_RDF}
            checked={sourceType === IMPORT_SOURCES.ZOTERO_RDF}
            onChange={(e) => setSourceType(e.target.value)}
          />
          <div className={styles.sourceInfo}>
            <span className={styles.sourceName}>Zotero RDF</span>
            <span className={styles.sourceDesc}>Export from Zotero using "Zotero RDF"</span>
          </div>
        </label>

        <label className={`${styles.sourceOption} ${sourceType === IMPORT_SOURCES.BIBTEX ? styles.selected : ''} ${styles.disabled}`}>
          <input
            type="radio"
            name="source"
            value={IMPORT_SOURCES.BIBTEX}
            disabled
          />
          <div className={styles.sourceInfo}>
            <span className={styles.sourceName}>BibTeX</span>
            <span className={styles.sourceDesc}>Coming soon</span>
          </div>
        </label>
      </div>

      <div className={styles.fileSection}>
        <label className={styles.label}>Library File</label>
        <div className={styles.fileInput}>
          <input
            ref={rdfInputRef}
            type="file"
            accept=".rdf,.xml"
            onChange={(e) => onFileSelect(e.target.files[0])}
            className={styles.hiddenInput}
          />
          <Btn small onClick={() => rdfInputRef.current?.click()}>
            Choose File
          </Btn>
          <span className={styles.fileName}>
            {rdfFile ? rdfFile.name : 'No file selected'}
          </span>
        </div>
      </div>

      <div className={styles.fileSection}>
        <label className={styles.label}>Attachments Folder (optional)</label>
        <p className={styles.hint}>
          Select the folder containing PDF files exported with your library
        </p>
        <div className={styles.fileInput}>
          <input
            ref={attachmentsInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => onAttachmentsSelect(e.target.files)}
            className={styles.hiddenInput}
          />
          <Btn small onClick={() => attachmentsInputRef.current?.click()}>
            Choose Folder
          </Btn>
          <span className={styles.fileName}>
            {attachmentsFolder ? `${attachmentsFolder.length} files` : 'No folder selected'}
          </span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <Btn
          gold
          onClick={onNext}
          disabled={!rdfFile || state === IMPORT_STATES.PARSING}
        >
          {state === IMPORT_STATES.PARSING ? (
            <>
              <Spinner size={14} />
              Parsing...
            </>
          ) : (
            'Scan Library'
          )}
        </Btn>
      </div>
    </div>
  )
}

// Step 2: Scan Results
function Step2_ScanResults({
  parsedData,
  importStats,
  importOptions,
  setImportOptions,
  onBack,
  onNext
}) {
  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Library Scan Results</h3>

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importStats?.totalItems || 0}</span>
          <span className={styles.statLabel}>Documents</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importStats?.totalCollections || 0}</span>
          <span className={styles.statLabel}>Collections</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importStats?.totalTags || 0}</span>
          <span className={styles.statLabel}>Tags</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importStats?.totalAttachments || 0}</span>
          <span className={styles.statLabel}>PDFs</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importStats?.totalNotes || 0}</span>
          <span className={styles.statLabel}>Notes</span>
        </div>
      </div>

      {importStats?.duplicateCount > 0 && (
        <div className={styles.warning}>
          Found {importStats.duplicateCount} potential duplicate(s)
        </div>
      )}

      <div className={styles.options}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={importOptions.importFolders}
            onChange={(e) => setImportOptions(prev => ({
              ...prev,
              importFolders: e.target.checked
            }))}
          />
          Import folder structure
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={importOptions.importTags}
            onChange={(e) => setImportOptions(prev => ({
              ...prev,
              importTags: e.target.checked
            }))}
          />
          Import tags
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={importOptions.importNotes}
            onChange={(e) => setImportOptions(prev => ({
              ...prev,
              importNotes: e.target.checked
            }))}
          />
          Import notes
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={importOptions.extractAnnotations}
            onChange={(e) => setImportOptions(prev => ({
              ...prev,
              extractAnnotations: e.target.checked
            }))}
          />
          Extract PDF annotations
        </label>
      </div>

      <div className={styles.actions}>
        <Btn onClick={onBack}>Back</Btn>
        <Btn gold onClick={onNext}>
          {importStats?.duplicateCount > 0 ? 'Review Duplicates' : 'Configure Folders'}
        </Btn>
      </div>
    </div>
  )
}

// Step 3: Map Folders
function Step3_MapFolders({
  collections,
  folders,
  folderMapping,
  setFolderMapping,
  defaultFolderId,
  setDefaultFolderId,
  onBack,
  onNext
}) {
  const folderOptions = [
    { id: 'root', name: 'Library Root' },
    ...Object.values(folders).map(f => ({
      id: f.id,
      name: f.name
    }))
  ]

  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Map Collections to Folders</h3>

      <div className={styles.mappingSection}>
        <label className={styles.label}>Default folder for unmapped items</label>
        <select
          className={styles.select}
          value={defaultFolderId}
          onChange={(e) => setDefaultFolderId(e.target.value)}
        >
          {folderOptions.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {collections.length > 0 ? (
        <div className={styles.mappingList}>
          {collections.slice(0, 10).map(coll => (
            <div key={coll.id} className={styles.mappingRow}>
              <span className={styles.collectionName}>{coll.name}</span>
              <select
                className={styles.select}
                value={folderMapping[coll.id] || defaultFolderId}
                onChange={(e) => setFolderMapping(prev => ({
                  ...prev,
                  [coll.id]: e.target.value
                }))}
              >
                <option value="">Create new folder</option>
                {folderOptions.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          ))}
          {collections.length > 10 && (
            <p className={styles.hint}>
              And {collections.length - 10} more collections...
            </p>
          )}
        </div>
      ) : (
        <p className={styles.hint}>No collections to map</p>
      )}

      <div className={styles.actions}>
        <Btn onClick={onBack}>Back</Btn>
        <Btn gold onClick={onNext}>Continue</Btn>
      </div>
    </div>
  )
}

// Step 4: Review Duplicates
function Step4_ReviewDuplicates({
  duplicates,
  resolutions,
  onResolve,
  onBack,
  onNext
}) {
  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Review Duplicates</h3>

      <p className={styles.hint}>
        Found {duplicates.length} potential duplicate(s). Choose how to handle each:
      </p>

      <div className={styles.duplicateList}>
        {duplicates.slice(0, 5).map(dup => (
          <div key={dup.index} className={styles.duplicateItem}>
            <div className={styles.duplicateInfo}>
              <span className={styles.duplicateTitle}>
                {dup.item.title || 'Untitled'}
              </span>
              <span className={styles.duplicateMatch}>
                {dup.matches[0]?.reason} ({dup.matches[0]?.confidence}%)
              </span>
            </div>
            <select
              className={styles.select}
              value={resolutions[dup.index]?.action || 'skip'}
              onChange={(e) => onResolve(
                dup.index,
                e.target.value,
                dup.matches[0]?.docId
              )}
            >
              <option value="skip">Skip (keep existing)</option>
              <option value="keep_both">Import anyway (keep both)</option>
              <option value="replace">Replace existing</option>
              <option value="merge_metadata">Merge metadata</option>
            </select>
          </div>
        ))}
        {duplicates.length > 5 && (
          <p className={styles.hint}>
            And {duplicates.length - 5} more duplicates...
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Btn onClick={onBack}>Back</Btn>
        <Btn gold onClick={onNext}>Start Import</Btn>
      </div>
    </div>
  )
}

// Step 5: Import Progress
function Step5_ImportProgress({ progress, state, error }) {
  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Importing...</h3>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {progress.current} / {progress.total} items
        </span>
      </div>

      {progress.item && (
        <p className={styles.currentItem}>
          {progress.stage === 'extracting_annotations'
            ? `Extracting annotations from: ${progress.item}`
            : `Importing: ${progress.item}`
          }
        </p>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.importingSpinner}>
        <Spinner size={32} />
      </div>
    </div>
  )
}

// Step 6: Complete
function Step6_Complete({ results, onClose }) {
  return (
    <div className={styles.step}>
      <h3 className={styles.stepTitle}>Import Complete!</h3>

      <div className={styles.results}>
        <div className={styles.resultItem}>
          <span className={styles.resultIcon}>✓</span>
          <span className={styles.resultText}>
            {results?.imported?.length || 0} documents imported
          </span>
        </div>

        {results?.skipped?.length > 0 && (
          <div className={styles.resultItem}>
            <span className={styles.resultIcon}>–</span>
            <span className={styles.resultText}>
              {results.skipped.length} skipped
            </span>
          </div>
        )}

        {results?.failed?.length > 0 && (
          <div className={styles.resultItem}>
            <span className={styles.resultIcon}>✗</span>
            <span className={styles.resultText}>
              {results.failed.length} failed
            </span>
          </div>
        )}

        {results?.annotationsExtracted > 0 && (
          <div className={styles.resultItem}>
            <span className={styles.resultIcon}>✓</span>
            <span className={styles.resultText}>
              {results.annotationsExtracted} annotations extracted
            </span>
          </div>
        )}

        {results?.notesImported > 0 && (
          <div className={styles.resultItem}>
            <span className={styles.resultIcon}>✓</span>
            <span className={styles.resultText}>
              {results.notesImported} notes imported
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Btn gold onClick={onClose}>Done</Btn>
      </div>
    </div>
  )
}
