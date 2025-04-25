import { useEffect, useState } from 'react'
import { EventBus } from '../../game/EventBus'
import { TimeEvents } from '../../../backend/src/Game/Time/events'
import { Time } from '../../../backend/src/Game/Time/types'
import styles from './World.module.css'

export const World = () => {
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

		EventBus.on(TimeEvents.SC.Updated, handleTimeUpdate)
		EventBus.on(TimeEvents.SC.Sync, handleTimeSync)
		EventBus.on(TimeEvents.SC.Paused, handlePause)
		EventBus.on(TimeEvents.SC.Resumed, handlePause)

		return () => {
			EventBus.off(TimeEvents.SC.Updated, handleTimeUpdate)
			EventBus.off(TimeEvents.SC.Sync, handleTimeSync)
			EventBus.off(TimeEvents.SC.Paused, handlePause)
			EventBus.off(TimeEvents.SC.Resumed, handlePause)
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