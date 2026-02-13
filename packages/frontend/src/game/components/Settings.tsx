import React, { useMemo, useState } from 'react'
import styles from './Settings.module.css'
import { useEventBus } from './hooks/useEventBus'
import { useSlidingPanel } from './hooks/useSlidingPanel'
import { UiEvents } from '../uiEvents'
import { EventBus } from '../EventBus'
import {
	getHighFidelity,
	getScrollSensitivity,
	getScrollSensitivityOptions,
	setHighFidelity,
	setScrollSensitivity
} from '../services/DisplaySettings'
import { getAutoRequestWorker, setAutoRequestWorker } from '../services/GameplaySettings'

export function Settings() {
	const { isVisible, isExiting, toggle, close } = useSlidingPanel()
	const initialHighFidelity = useMemo(() => getHighFidelity(), [])
	const initialScrollSensitivity = useMemo(() => getScrollSensitivity(), [])
	const initialAutoRequestWorker = useMemo(() => getAutoRequestWorker(), [])
	const [highFidelity, setHighFidelityState] = useState(initialHighFidelity)
	const [scrollSensitivity, setScrollSensitivityState] = useState(initialScrollSensitivity)
	const [autoRequestWorker, setAutoRequestWorkerState] = useState(initialAutoRequestWorker)
	const scrollOptions = useMemo(() => getScrollSensitivityOptions(), [])

	useEventBus(UiEvents.Settings.Toggle, toggle)
	useEventBus(UiEvents.Inventory.Toggle, close)
	useEventBus(UiEvents.Quests.Toggle, close)
	useEventBus(UiEvents.Relationships.Toggle, close)

	const handleClose = () => close()
	const handleHighFidelityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const enabled = event.target.checked
		setHighFidelityState(enabled)
		setHighFidelity(enabled)
		EventBus.emit(UiEvents.Settings.HighFidelity, { enabled })
	}
	const handleScrollSensitivityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const level = setScrollSensitivity(Number(event.target.value))
		setScrollSensitivityState(level)
		EventBus.emit(UiEvents.Settings.ScrollSensitivity, { level })
	}
	const handleAutoRequestWorkerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const enabled = event.target.checked
		setAutoRequestWorkerState(enabled)
		setAutoRequestWorker(enabled)
	}

	if (!isVisible && !isExiting) {
		return null
	}

	return (
		<div className={`${styles.settingsContainer} ${isExiting ? styles.slideOut : ''}`}>
			<div className={styles.settingsContent}>
				<button 
					className={styles.closeIcon}
					onClick={handleClose}
					aria-label="Close settings"
				>
					×
				</button>
				<h2 className={styles.title}>Settings</h2>
				<div className={styles.settingsList}>
					<div className={styles.settingCard}>
						<h3 className={styles.settingTitle}>Audio</h3>
						<div className={styles.settingContent}>
							<div className={styles.settingRow}>
								<label htmlFor="musicVolume">Music Volume</label>
								<input 
									type="range" 
									id="musicVolume" 
									min="0" 
									max="100" 
									defaultValue="50"
									className={styles.slider}
								/>
							</div>
							<div className={styles.settingRow}>
								<label htmlFor="sfxVolume">SFX Volume</label>
								<input 
									type="range" 
									id="sfxVolume" 
									min="0" 
									max="100" 
									defaultValue="50"
									className={styles.slider}
								/>
							</div>
						</div>
					</div>
					<div className={styles.settingCard}>
						<h3 className={styles.settingTitle}>Graphics</h3>
						<div className={styles.settingContent}>
							<div className={styles.settingRow}>
								<label htmlFor="highFidelity">High fidelity (Retina)</label>
								<input
									id="highFidelity"
									type="checkbox"
									className={styles.checkbox}
									checked={highFidelity}
									onChange={handleHighFidelityChange}
								/>
							</div>
							<div className={styles.settingRow}>
								<label htmlFor="quality">Quality</label>
								<select id="quality" className={styles.select}>
									<option value="low">Low</option>
									<option value="medium">Medium</option>
									<option value="high">High</option>
								</select>
							</div>
						</div>
					</div>
					<div className={styles.settingCard}>
						<h3 className={styles.settingTitle}>Controls</h3>
						<div className={styles.settingContent}>
							<div className={styles.settingRow}>
								<label htmlFor="scrollSensitivity">Scroll speed</label>
								<select
									id="scrollSensitivity"
									className={styles.select}
									value={scrollSensitivity}
									onChange={handleScrollSensitivityChange}
								>
									{scrollOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
						</div>
					</div>
					<div className={styles.settingCard}>
						<h3 className={styles.settingTitle}>Automation</h3>
						<div className={styles.settingContent}>
							<div className={styles.settingRow}>
								<label htmlFor="autoRequestWorker">Auto-request first worker</label>
								<input
									id="autoRequestWorker"
									type="checkbox"
									className={styles.checkbox}
									checked={autoRequestWorker}
									onChange={handleAutoRequestWorkerChange}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
} 
