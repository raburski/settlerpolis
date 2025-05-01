import { useState, useEffect } from 'react'
import { EventBus } from '../../EventBus'
import { Event } from "@rugged/game"

/**
 * Hook to get the current player ID from the server
 * @returns The current player ID or null if not connected
 */
export const usePlayerId = () => {
	const [playerId, setPlayerId] = useState<string | null>(null)

	useEffect(() => {
		const handlePlayerConnected = (data: { playerId: string, mapId?: string, position?: { x: number, y: number }}) => {
			setPlayerId(data.playerId)
		}

		EventBus.on(Event.Players.SC.Connected, handlePlayerConnected)

		return () => {
			EventBus.off(Event.Players.SC.Connected, handlePlayerConnected)
		}
	}, [])

	return playerId
} 