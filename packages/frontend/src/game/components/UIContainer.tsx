import { useEffect, useRef, useState } from 'react'
import { Chat } from './Chat'
import { Inventory } from './Inventory'
import { ChatLog } from './ChatLog'
import { DialogUI } from './DialogUI'
import { Quests } from './Quests'
import { Relationships } from './Relationships'
import { SidePanel } from './SidePanel'
import { Settings } from './Settings'
import { TopBar } from './TopBar'
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
	const [isStockOpen, setIsStockOpen] = useState(false)
	const [isPopulationOpen, setIsPopulationOpen] = useState(false)
	const populationButtonRef = useRef<HTMLButtonElement | null>(null)
	const [populationAnchor, setPopulationAnchor] = useState<DOMRect | null>(null)

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

	useEffect(() => {
		if (!isPopulationOpen) {
			return
		}

		const updateAnchor = () => {
			if (populationButtonRef.current) {
				setPopulationAnchor(populationButtonRef.current.getBoundingClientRect())
			}
		}

		updateAnchor()
		window.addEventListener('resize', updateAnchor)

		return () => {
			window.removeEventListener('resize', updateAnchor)
		}
	}, [isPopulationOpen])

	if (!isVisible) {
		return null
	}

	return (
		<>
			<TopBar
				isStockOpen={isStockOpen}
				onToggleStock={() => {
					setIsPopulationOpen(false)
					setIsStockOpen((prev) => !prev)
				}}
				isPopulationOpen={isPopulationOpen}
				onTogglePopulation={() => {
					setIsStockOpen(false)
					setIsPopulationOpen((prev) => !prev)
				}}
				populationButtonRef={populationButtonRef}
			/>
			<StockPanel
				isVisible={isStockOpen}
				onClose={() => setIsStockOpen(false)}
			/>
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
			<PopulationPanel
				isVisible={isPopulationOpen}
				onClose={() => setIsPopulationOpen(false)}
				anchorRect={populationAnchor}
			/>
		</>
	)
}
