import { useEffect, useState } from 'react'
import { Chat } from './Chat'
import { Inventory } from './Inventory'
import { ChatLog } from './ChatLog'
import { DialogUI } from './DialogUI'
import { Quests } from './Quests'
import { Relationships } from './Relationships'
import { SidePanel } from './SidePanel'
import { EventBus } from "../EventBus"
import { Event } from "../events"
import { FXType } from "../../../backend/src/Game/FX/types"

export const UIContainer = () => {
	const [isVisible, setIsVisible] = useState(true)

	useEffect(() => {
        const handleEvent = (data) => {
            if (data.type === FXType.HideUI) {
                setIsVisible(false)
            } else if (data.type === FXType.ShowUI) {
                setIsVisible(true)
            }
		}
		EventBus.on(Event.FX.SC.Play, handleEvent)

		return () => {
			EventBus.off(handleEvent)
		}
	}, [])

	if (!isVisible) {
		return null
	}

	return (
		<>
			<Chat />
			<Inventory />
			<ChatLog />
			<DialogUI />
			<Quests />
			<Relationships />
			<SidePanel />
		</>
	)
} 