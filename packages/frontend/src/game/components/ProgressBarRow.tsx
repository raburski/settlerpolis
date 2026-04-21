import React from 'react'
import styles from './ProgressBarRow.module.css'

export type ProgressBarLevel = 'healthy' | 'urgent' | 'critical'

interface ProgressBarRowProps {
	label: string
	percent: number
	valueLabel?: string
	level?: ProgressBarLevel
}

export const ProgressBarRow: React.FC<ProgressBarRowProps> = ({ label, percent, valueLabel, level = 'healthy' }) => {
	const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)))
	const displayValue = valueLabel ?? `${clampedPercent}%`

	return (
		<div className={styles.row}>
			<div className={styles.header}>
				<span className={styles.label}>{label}</span>
				<span className={styles.value}>{displayValue}</span>
			</div>
			<div className={styles.track}>
				<div className={styles.fill} style={{ width: `${clampedPercent}%` }} data-level={level} />
			</div>
		</div>
	)
}
