import { useEffect, useState } from 'react'
import { Event } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { buildingService } from '../../services/BuildingService'
import { buildResourceList } from '../../utils/resources'

export const useResourceList = (): string[] => {
	const [resources, setResources] = useState<string[]>([])

	useEffect(() => {
		const rebuild = () => {
			const definitions = buildingService.getAllBuildingDefinitions()
			setResources(buildResourceList(definitions))
		}

		rebuild()
		EventBus.on(Event.Buildings.SC.Catalog, rebuild)

		return () => {
			EventBus.off(Event.Buildings.SC.Catalog, rebuild)
		}
	}, [])

	return resources
}
