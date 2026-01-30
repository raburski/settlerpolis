import { useEffect, useState } from 'react'
import { Chat } from './Chat'
import { Inventory } from './Inventory'
import { ChatLog } from './ChatLog'
import { DialogUI } from './DialogUI'
import { Quests } from './Quests'
import { Relationships } from './Relationships'
import { SidePanel } from './SidePanel'
import { Settings } from './Settings'
import { World } from './World'
import { StockPanel } from './StockPanel'
import { SystemMessages } from './SystemMessages'
import { ConstructionPanel } from './ConstructionPanel'
import { BuildingInfoPanel } from './BuildingInfoPanel'
import { PopulationPanel } from './PopulationPanel'
import { SettlerInfoPanel } from './SettlerInfoPanel'
import { EventBus } from "../EventBus"
import { Event, FXType } from '@rugged/game'

export const UIContainer = () => {
	const [isVisible, setIsVisible] = useState(true)

	useEffect(() => {
        const handleEvent = (data) => {
            if (data.type === FXType.DisplayUI) {
                setIsVisible(data.visible ?? true)
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
			<World />
			<StockPanel />
			<Chat />
			<Inventory />
			<ChatLog />
			<DialogUI />
			<Quests />
			<Relationships />
			<Settings />
			<SidePanel />
			<SystemMessages />
			<ConstructionPanel />
			<BuildingInfoPanel />
			<SettlerInfoPanel />
			<PopulationPanel />
		</>
	)
} 
