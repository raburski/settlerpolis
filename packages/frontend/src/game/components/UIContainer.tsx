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
import { Notifications } from './Notifications'
import { ConstructionPanel } from './ConstructionPanel'
import { BuildingInfoPanel } from './BuildingInfoPanel'
import { PopulationPanel } from './PopulationPanel'
import { LogisticsPanel } from './LogisticsPanel'
import { SettlerInfoPanel } from './SettlerInfoPanel'
import { SaveLoadPanel } from './SaveLoadPanel'
import { WorldMapPanel } from './WorldMapPanel'
import { EventBus } from "../EventBus"
import { Event, FXType } from '@rugged/game'
import { UiEvents } from '../uiEvents'

export const UIContainer = () => {
	const [isVisible, setIsVisible] = useState(true)
	const [isStockOpen, setIsStockOpen] = useState(false)
	const [isPopulationOpen, setIsPopulationOpen] = useState(false)
	const [isLogisticsOpen, setIsLogisticsOpen] = useState(false)
	const [isWorldMapOpen, setIsWorldMapOpen] = useState(false)
	const [saveLoadMode, setSaveLoadMode] = useState<'save' | 'load' | null>(null)
	const [showDebugBounds, setShowDebugBounds] = useState(false)
	const stockButtonRef = useRef<HTMLButtonElement | null>(null)
	const [stockAnchor, setStockAnchor] = useState<DOMRect | null>(null)
	const populationButtonRef = useRef<HTMLButtonElement | null>(null)
	const [populationAnchor, setPopulationAnchor] = useState<DOMRect | null>(null)
	const logisticsButtonRef = useRef<HTMLButtonElement | null>(null)
	const [logisticsAnchor, setLogisticsAnchor] = useState<DOMRect | null>(null)

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
		if (!isStockOpen) {
			return
		}

		const updateAnchor = () => {
			if (stockButtonRef.current) {
				setStockAnchor(stockButtonRef.current.getBoundingClientRect())
			}
		}

		updateAnchor()
		window.addEventListener('resize', updateAnchor)

		return () => {
			window.removeEventListener('resize', updateAnchor)
		}
	}, [isStockOpen])

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

	useEffect(() => {
		if (!isLogisticsOpen) {
			return
		}

		const updateAnchor = () => {
			if (logisticsButtonRef.current) {
				setLogisticsAnchor(logisticsButtonRef.current.getBoundingClientRect())
			}
		}

		updateAnchor()
		window.addEventListener('resize', updateAnchor)

		return () => {
			window.removeEventListener('resize', updateAnchor)
		}
	}, [isLogisticsOpen])

	useEffect(() => {
		if (!isWorldMapOpen) {
			return
		}
		EventBus.emit(UiEvents.Building.Close, {})
		EventBus.emit(UiEvents.Settler.Close, {})
		EventBus.emit(UiEvents.Construction.Cancel, {})
	}, [isWorldMapOpen])

	if (!isVisible) {
		return null
	}

	return (
		<>
			<TopBar
				isStockOpen={isStockOpen}
				onToggleStock={() => {
					setIsPopulationOpen(false)
					setIsLogisticsOpen(false)
					setIsStockOpen((prev) => !prev)
				}}
				isPopulationOpen={isPopulationOpen}
				onTogglePopulation={() => {
					setIsStockOpen(false)
					setIsLogisticsOpen(false)
					setIsPopulationOpen((prev) => !prev)
				}}
				isLogisticsOpen={isLogisticsOpen}
				onToggleLogistics={() => {
					setIsStockOpen(false)
					setIsPopulationOpen(false)
					setIsLogisticsOpen((prev) => !prev)
				}}
				isWorldMapOpen={isWorldMapOpen}
				onToggleWorldMap={() => setIsWorldMapOpen((prev) => !prev)}
				showDebugBounds={showDebugBounds}
				onToggleDebugBounds={() => {
					setShowDebugBounds((prev) => {
						const next = !prev
						EventBus.emit(UiEvents.Debug.BoundsToggle, { enabled: next })
						return next
					})
				}}
				onOpenSave={() => setSaveLoadMode('save')}
				onOpenLoad={() => setSaveLoadMode('load')}
				resourceButtonRef={stockButtonRef}
				populationButtonRef={populationButtonRef}
				logisticsButtonRef={logisticsButtonRef}
			/>
			<SaveLoadPanel
				isOpen={saveLoadMode !== null}
				mode={saveLoadMode ?? 'save'}
				onClose={() => setSaveLoadMode(null)}
			/>
			<WorldMapPanel
				isOpen={isWorldMapOpen}
				onClose={() => setIsWorldMapOpen(false)}
			/>
			<Notifications />
			<StockPanel
				isVisible={isStockOpen}
				onClose={() => setIsStockOpen(false)}
				anchorRect={stockAnchor}
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
			{!isWorldMapOpen ? <ConstructionPanel /> : null}
			{!isWorldMapOpen ? <BuildingInfoPanel /> : null}
			{!isWorldMapOpen ? <SettlerInfoPanel /> : null}
			<PopulationPanel
				isVisible={isPopulationOpen}
				onClose={() => setIsPopulationOpen(false)}
				anchorRect={populationAnchor}
			/>
			<LogisticsPanel
				isVisible={isLogisticsOpen}
				anchorRect={logisticsAnchor}
			/>
		</>
	)
}
