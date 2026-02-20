import React, { useEffect, useState } from 'react'
import { Time } from '@rugged/game'
import { timeService } from '../services/TimeService'
import styles from './World.module.css'

type WorldProps = {
	className?: string
}

export const World: React.FC<WorldProps> = ({ className }) => {
	const [time, setTime] = useState<Time>(timeService.getState().time)
	const [isPaused, setIsPaused] = useState(timeService.getState().isPaused)

	useEffect(() => {
		return timeService.subscribe((state) => {
			setTime(state.time)
			setIsPaused(state.isPaused)
		})
	}, [])

	const formatTime = (hours: number, minutes: number) => {
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
	}

	const formatDate = (day: number, month: number, year: number) => {
		return `${day}/${month}/${year}`
	}

	return (
		<div className={[styles.worldContainer, className].filter(Boolean).join(' ')}>
			<div className={styles.timeDisplay}>
				<div className={styles.date}>{formatDate(time.day, time.month, time.year)}</div>
				<div className={styles.time}>{formatTime(time.hours, time.minutes)}</div>
				{isPaused && <div className={styles.paused}>PAUSED</div>}
			</div>
		</div>
	)
} 
