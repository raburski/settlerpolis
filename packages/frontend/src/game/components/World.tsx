import React, { useEffect, useState } from 'react'
import { EventBus } from '../../game/EventBus'
import { Event } from '@rugged/game'
import { Time } from '@rugged/game'
import styles from './World.module.css'

type WorldProps = {
	className?: string
}

export const World: React.FC<WorldProps> = ({ className }) => {
	const [time, setTime] = useState<Time>({
		hours: 0,
		minutes: 0,
		day: 1,
		month: 1,
		year: 1
	})
	const [isPaused, setIsPaused] = useState(false)

	useEffect(() => {
		const handleTimeUpdate = (data: { time: Time }) => {
			setTime(data.time)
		}

		const handleTimeSync = (data: { time: Time, isPaused: boolean }) => {
			setTime(data.time)
			setIsPaused(data.isPaused)
		}

		const handlePause = (data: { isPaused: boolean }) => {
			setIsPaused(data.isPaused)
		}

		EventBus.on(Event.Time.SC.Updated, handleTimeUpdate)
		EventBus.on(Event.Time.SC.Sync, handleTimeSync)
		EventBus.on(Event.Time.SC.Paused, handlePause)
		EventBus.on(Event.Time.SC.Resumed, handlePause)

		return () => {
			EventBus.off(Event.Time.SC.Updated, handleTimeUpdate)
			EventBus.off(Event.Time.SC.Sync, handleTimeSync)
			EventBus.off(Event.Time.SC.Paused, handlePause)
			EventBus.off(Event.Time.SC.Resumed, handlePause)
		}
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
