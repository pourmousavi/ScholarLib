import { useState, useRef, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './NewFolderModal.module.css'

export default function NewFolderModal({ onClose }) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef(null)

  const folders = useLibraryStore((s) => s.folders)
  const addFolder = useLibraryStore((s) => s.addFolder)
  const updateFolder = useLibraryStore((s) => s.updateFolder)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const { showToast } = useToast()

  // Default parent to currently selected folder
  useEffect(() => {
    if (selectedFolderId) {
      setParentId(selectedFolderId)
    }
  }, [selectedFolderId])

  // Auto-focus the name input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const slugify = (str) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) {
      showToast({ message: 'Enter a folder name', type: 'warning' })
      return
    }

    // Check for duplicate names at the same level
    const siblings = folders.filter(f => f.parent_id === parentId)
    if (siblings.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast({ message: 'A folder with this name already exists here', type: 'warning' })
      return
    }

    setIsSaving(true)
    try {
      const folderId = `f_${crypto.randomUUID().slice(0, 8)}`
      const slug = slugify(trimmed)
      const maxSort = siblings.reduce((max, f) => Math.max(max, f.sort_order || 0), -1)

      const newFolder = {
        id: folderId,
        name: trimmed,
        slug,
        parent_id: parentId,
        children: [],
        created_at: new Date().toISOString(),
        shared_with: [],
        color: null,
        icon: null,
        sort_order: maxSort + 1
      }

      addFolder(newFolder)

      // Update parent's children array
      if (parentId) {
        const parent = folders.find(f => f.id === parentId)
        if (parent) {
          updateFolder(parentId, {
            children: [...(parent.children || []), folderId]
          })
        }
      }

      // Persist to storage
      if (!isDemoMode && adapter) {
        await useLibraryStore.getState().saveLibrary(adapter)
      }

      setSelectedFolderId(folderId)
      showToast({ message: `Created folder "${trimmed}"`, type: 'success' })
      onClose()
    } catch (error) {
      console.error('Failed to create folder:', error)
      showToast({ message: 'Failed to create folder', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // Build flat list with indentation for the parent picker
  const buildOptions = () => {
    const options = [{ id: null, name: '(Root level)', depth: 0 }]
    const addChildren = (parentIdVal, depth) => {
      folders
        .filter(f => f.parent_id === parentIdVal)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(f => {
          options.push({ id: f.id, name: f.name, depth })
          addChildren(f.id, depth + 1)
        })
    }
    addChildren(null, 1)
    return options
  }

  const parentOptions = buildOptions()

  return (
    <Modal onClose={onClose} width={420} title="Create new folder">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>New Folder</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Folder name
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Battery Degradation"
              maxLength={100}
              autoComplete="off"
            />
          </label>
          <label className={styles.label}>
            Parent folder
            <select
              className={styles.select}
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              {parentOptions.map((opt) => (
                <option key={opt.id || '__root'} value={opt.id || ''}>
                  {'  '.repeat(opt.depth)}{opt.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.createBtn}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
