import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { WorldEvents } from '../../../backend/src/Game/World/events'
import { WorldTime } from '../../../backend/src/Game/World/types'
import styles from './World.module.css'

export const World = () => {
	const [time, setTime] = useState<WorldTime>({
		hours: 8,
		minutes: 0,
		day: 1,
		month: 1,
		year: 1
	})
	const [isPaused, setIsPaused] = useState(false)

	useEffect(() => {
		const handleTimeUpdate = (data: { time: WorldTime }) => {
			setTime(data.time)
		}

		const handleTimeSync = (data: { time: WorldTime, isPaused: boolean }) => {
			setTime(data.time)
			setIsPaused(data.isPaused)
		}

		const handlePause = (data: { isPaused: boolean }) => {
			setIsPaused(data.isPaused)
		}

		EventBus.on(WorldEvents.SC.Updated, handleTimeUpdate)
		EventBus.on(WorldEvents.SC.Sync, handleTimeSync)
		EventBus.on(WorldEvents.SC.Paused, handlePause)
		EventBus.on(WorldEvents.SC.Resumed, handlePause)

		return () => {
			EventBus.off(WorldEvents.SC.Updated, handleTimeUpdate)
			EventBus.off(WorldEvents.SC.Sync, handleTimeSync)
			EventBus.off(WorldEvents.SC.Paused, handlePause)
			EventBus.off(WorldEvents.SC.Resumed, handlePause)
		}
	}, [])

	const formatTime = (hours: number, minutes: number) => {
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
	}

	const formatDate = (day: number, month: number, year: number) => {
		return `${day}/${month}/${year}`
	}

	return (
		<div className={styles.worldContainer}>
			<div className={styles.timeDisplay}>
				<div className={styles.date}>{formatDate(time.day, time.month, time.year)}</div>
				<div className={styles.time}>{formatTime(time.hours, time.minutes)}</div>
				{isPaused && <div className={styles.paused}>PAUSED</div>}
			</div>
		</div>
	)
} 