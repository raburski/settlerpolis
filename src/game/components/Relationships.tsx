import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { AffinityEvents } from '../../../backend/src/Game/Affinity/events'
import { OverallNPCApproach } from '../../../backend/src/Game/Affinity/types'
import styles from './Relationships.module.css'

interface NPCRelationship {
	npcId: string
	approach: OverallNPCApproach
}

export function Relationships() {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)
	const [relationships, setRelationships] = useState<NPCRelationship[]>([])

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
			// Close relationships when inventory is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleQuestsToggle = () => {
			// Close relationships when quests is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleSettingsToggle = () => {
			// Close relationships when settings is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		EventBus.on('ui:relationships:toggle', handleToggle)
		EventBus.on('ui:inventory:toggle', handleInventoryToggle)
		EventBus.on('ui:quests:toggle', handleQuestsToggle)
		EventBus.on('ui:settings:toggle', handleSettingsToggle)

		return () => {
			EventBus.off('ui:relationships:toggle', handleToggle)
			EventBus.off('ui:inventory:toggle', handleInventoryToggle)
			EventBus.off('ui:quests:toggle', handleQuestsToggle)
			EventBus.off('ui:settings:toggle', handleSettingsToggle)
		}
	}, [isVisible])

	useEffect(() => {
		const handleRelationshipList = (data: { affinities: NPCRelationship[] }) => {
			setRelationships(data.affinities)
		}

		const handleRelationshipUpdate = (data: { npcId: string, approach: OverallNPCApproach }) => {
			setRelationships(prev => {
				const newRelationships = [...prev]
				const index = newRelationships.findIndex(r => r.npcId === data.npcId)
				if (index !== -1) {
					newRelationships[index] = {
						npcId: data.npcId,
						approach: data.approach
					}
				} else {
					newRelationships.push({
						npcId: data.npcId,
						approach: data.approach
					})
				}
				return newRelationships
			})
		}

		EventBus.on(AffinityEvents.SC.List, handleRelationshipList)
		EventBus.on(AffinityEvents.SC.Update, handleRelationshipUpdate)

		return () => {
			EventBus.off(AffinityEvents.SC.List, handleRelationshipList)
			EventBus.off(AffinityEvents.SC.Update, handleRelationshipUpdate)
		}
	}, [])

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

	const getApproachEmoji = (approach: OverallNPCApproach): string => {
		// Basic approaches
		if (approach === OverallNPCApproach.Enemy) return '😠'
		if (approach === OverallNPCApproach.Rival) return '😤'
		if (approach === OverallNPCApproach.Stranger) return '😐'
		if (approach === OverallNPCApproach.Acquaintance) return '🙂'
		if (approach === OverallNPCApproach.Friend) return '😊'
		if (approach === OverallNPCApproach.Ally) return '🤝'
		
		// Complex approaches
		if (approach === OverallNPCApproach.Ambivalent) return '🤔'
		if (approach === OverallNPCApproach.Competitive) return '🏆'
		if (approach === OverallNPCApproach.Obsessed) return '👁️'
		
		// Transactional approaches
		if (approach === OverallNPCApproach.Businesslike) return '💼'
		if (approach === OverallNPCApproach.Employing) return '💰'
		if (approach === OverallNPCApproach.Working) return '🔧'
		if (approach === OverallNPCApproach.Contracting) return '📝'
		
		// Social approaches
		if (approach === OverallNPCApproach.Indifferent) return '😶'
		if (approach === OverallNPCApproach.Acquainted) return '👋'
		if (approach === OverallNPCApproach.Friendly) return '😃'
		if (approach === OverallNPCApproach.Intimate) return '❤️'
		if (approach === OverallNPCApproach.Accompanying) return '👥'
		
		// Trust-based approaches
		if (approach === OverallNPCApproach.Trusting) return '🤝'
		if (approach === OverallNPCApproach.Mentoring) return '📚'
		if (approach === OverallNPCApproach.Learning) return '🧠'
		if (approach === OverallNPCApproach.Protecting) return '🛡️'
		
		// Commitment-based approaches
		if (approach === OverallNPCApproach.Supporting) return '👍'
		if (approach === OverallNPCApproach.Fighting) return '⚔️'
		if (approach === OverallNPCApproach.Devoting) return '🙏'
		if (approach === OverallNPCApproach.Following) return '👣'
		
		// Hostile approaches
		if (approach === OverallNPCApproach.Antagonistic) return '😡'
		if (approach === OverallNPCApproach.Vengeful) return '⚡'
		if (approach === OverallNPCApproach.Hateful) return '💀'
		
		return '❓'
	}

	const getApproachColor = (approach: OverallNPCApproach): string => {
		// Basic approaches
		if (approach === OverallNPCApproach.Enemy) return 'var(--color-accent-red)'
		if (approach === OverallNPCApproach.Rival) return 'var(--color-accent-orange)'
		if (approach === OverallNPCApproach.Stranger) return 'var(--color-text-secondary)'
		if (approach === OverallNPCApproach.Acquaintance) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Friend) return 'var(--color-accent-green)'
		if (approach === OverallNPCApproach.Ally) return 'var(--color-accent-primary)'
		
		// Complex approaches
		if (approach === OverallNPCApproach.Ambivalent) return 'var(--color-accent-purple)'
		if (approach === OverallNPCApproach.Competitive) return 'var(--color-accent-orange)'
		if (approach === OverallNPCApproach.Obsessed) return 'var(--color-accent-pink)'
		
		// Transactional approaches
		if (approach === OverallNPCApproach.Businesslike) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Employing) return 'var(--color-accent-green)'
		if (approach === OverallNPCApproach.Working) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Contracting) return 'var(--color-accent-blue)'
		
		// Social approaches
		if (approach === OverallNPCApproach.Indifferent) return 'var(--color-text-secondary)'
		if (approach === OverallNPCApproach.Acquainted) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Friendly) return 'var(--color-accent-green)'
		if (approach === OverallNPCApproach.Intimate) return 'var(--color-accent-pink)'
		if (approach === OverallNPCApproach.Accompanying) return 'var(--color-accent-green)'
		
		// Trust-based approaches
		if (approach === OverallNPCApproach.Trusting) return 'var(--color-accent-purple)'
		if (approach === OverallNPCApproach.Mentoring) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Learning) return 'var(--color-accent-blue)'
		if (approach === OverallNPCApproach.Protecting) return 'var(--color-accent-green)'
		
		// Commitment-based approaches
		if (approach === OverallNPCApproach.Supporting) return 'var(--color-accent-green)'
		if (approach === OverallNPCApproach.Fighting) return 'var(--color-accent-red)'
		if (approach === OverallNPCApproach.Devoting) return 'var(--color-accent-primary)'
		if (approach === OverallNPCApproach.Following) return 'var(--color-accent-blue)'
		
		// Hostile approaches
		if (approach === OverallNPCApproach.Antagonistic) return 'var(--color-accent-red)'
		if (approach === OverallNPCApproach.Vengeful) return 'var(--color-accent-red)'
		if (approach === OverallNPCApproach.Hateful) return 'var(--color-accent-red)'
		
		return 'var(--color-text-secondary)'
	}

	const formatNPCName = (npcId: string): string => {
		// Convert camelCase to Title Case
		return npcId
			.replace(/([A-Z])/g, ' $1') // Add space before capital letters
			.replace(/^./, str => str.toUpperCase()) // Capitalize first letter
			.trim()
	}

	return (
		<div className={`${styles.relationshipsContainer} ${isExiting ? styles.slideOut : ''}`}>
			<div className={styles.relationshipsContent}>
				<button 
					className={styles.closeIcon}
					onClick={handleClose}
					aria-label="Close relationships"
				>
					×
				</button>
				<h2 className={styles.title}>Relationships</h2>
				<div className={styles.relationshipList}>
					{relationships.length === 0 ? (
						<p className={styles.emptyText}>No relationships yet</p>
					) : (
						relationships.map(relationship => (
							<div key={relationship.npcId} className={styles.relationshipCard}>
								<div className={styles.relationshipHeader}>
									<h3 className={styles.npcName}>{formatNPCName(relationship.npcId)}</h3>
									<span 
										className={styles.approachBadge}
										style={{ color: getApproachColor(relationship.approach) }}
									>
										{getApproachEmoji(relationship.approach)} {relationship.approach}
									</span>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	)
} 