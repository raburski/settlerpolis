import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import styles from './Settings.module.css'

export function Settings() {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)

	useEffect(() => {
		const handleToggle = () => {
			if (isVisible) {
				// Start exit animation
				setIsExiting(true)
				// Wait for animation to complete before hiding
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300) // Match animation duration
			} else {
				setIsVisible(true)
			}
		}

		const handleInventoryToggle = () => {
			// Close settings when inventory is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleQuestsToggle = () => {
			// Close settings when quests is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleRelationshipsToggle = () => {
			// Close settings when relationships is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		EventBus.on('ui:settings:toggle', handleToggle)
		EventBus.on('ui:inventory:toggle', handleInventoryToggle)
		EventBus.on('ui:quests:toggle', handleQuestsToggle)
		EventBus.on('ui:relationships:toggle', handleRelationshipsToggle)

		return () => {
			EventBus.off('ui:settings:toggle', handleToggle)
			EventBus.off('ui:inventory:toggle', handleInventoryToggle)
			EventBus.off('ui:quests:toggle', handleQuestsToggle)
			EventBus.off('ui:relationships:toggle', handleRelationshipsToggle)
		}
	}, [isVisible])

	const handleClose = () => {
		setIsExiting(true)
		setTimeout(() => {
			setIsVisible(false)
			setIsExiting(false)
		}, 300)
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
								<label htmlFor="quality">Quality</label>
								<select id="quality" className={styles.select}>
									<option value="low">Low</option>
									<option value="medium">Medium</option>
									<option value="high">High</option>
								</select>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
} 