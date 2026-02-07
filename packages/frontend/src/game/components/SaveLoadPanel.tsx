import { useEffect, useMemo, useState } from 'react'
import styles from './SaveLoadPanel.module.css'

type SaveEntry = {
	name: string
	savedAt: number
}

type SaveLoadPanelProps = {
	isOpen: boolean
	mode: 'save' | 'load'
	onClose: () => void
}

const formatTimestamp = (timestamp: number) => {
	const date = new Date(timestamp)
	return date.toLocaleString()
}

export const SaveLoadPanel = ({ isOpen, mode, onClose }: SaveLoadPanelProps) => {
	const [name, setName] = useState('')
	const [saves, setSaves] = useState<SaveEntry[]>([])

	const listSnapshots = () => {
		const listFn = (window as any).__ruggedListSnapshots
		if (typeof listFn !== 'function') {
			return []
		}
		const result = listFn()
		if (!Array.isArray(result)) {
			return []
		}
		return result
	}

	useEffect(() => {
		if (!isOpen) {
			return
		}
		setSaves(listSnapshots())
		setName('')
	}, [isOpen])

	const handleSave = async () => {
		const saveFn = (window as any).__ruggedSaveSnapshot
		if (typeof saveFn !== 'function') {
			console.warn('[SaveLoadPanel] Snapshot save function is not available')
			return
		}
		if (!name.trim()) {
			return
		}
		await saveFn(name.trim())
		setSaves(listSnapshots())
		onClose()
	}

	const handleLoad = async (saveName: string) => {
		const loadFn = (window as any).__ruggedLoadSnapshot
		if (typeof loadFn !== 'function') {
			console.warn('[SaveLoadPanel] Snapshot load function is not available')
			return
		}
		await loadFn(saveName)
		onClose()
	}

	const sortedSaves = useMemo(() => {
		return [...saves].sort((a, b) => b.savedAt - a.savedAt)
	}, [saves])

	if (!isOpen) {
		return null
	}

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.panel} onClick={(event) => event.stopPropagation()}>
				<div className={styles.header}>
					<h2 className={styles.title}>{mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
					<button type="button" className={styles.closeButton} onClick={onClose}>
						✕
					</button>
				</div>
				{mode === 'save' ? (
					<div className={styles.saveSection}>
						<label className={styles.label} htmlFor="save-name">
							Save name
						</label>
						<input
							id="save-name"
							className={styles.input}
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Before winter"
						/>
						<button type="button" className={styles.primaryButton} onClick={handleSave} disabled={!name.trim()}>
							Save
						</button>
					</div>
				) : null}
				<div className={styles.listSection}>
					<h3 className={styles.subtitle}>Saved games</h3>
					{sortedSaves.length === 0 ? (
						<p className={styles.empty}>No saves yet.</p>
					) : (
						<ul className={styles.list}>
							{sortedSaves.map((entry) => (
								<li key={entry.name} className={styles.listItem}>
									<div className={styles.saveMeta}>
										<span className={styles.saveName}>{entry.name}</span>
										<span className={styles.saveDate}>{formatTimestamp(entry.savedAt)}</span>
									</div>
									{mode === 'load' ? (
										<button
											type="button"
											className={styles.secondaryButton}
											onClick={() => handleLoad(entry.name)}
										>
											Load
										</button>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	)
}
