import { useEffect, useState } from 'react'
import { EventBus } from '../../EventBus'
import { storageService } from '../../services/StorageService'

export const useGlobalStockTotals = () => {
	const [totals, setTotals] = useState<Record<string, number>>({})

	const updateTotals = () => {
		const nextTotals: Record<string, number> = {}
		storageService.getAllBuildingStorages().forEach((storage) => {
			Object.entries(storage.items).forEach(([itemType, quantity]) => {
				nextTotals[itemType] = (nextTotals[itemType] || 0) + quantity
			})
		})
		setTotals(nextTotals)
	}

	useEffect(() => {
		updateTotals()
		EventBus.on('ui:storage:updated', updateTotals)

		return () => {
			EventBus.off('ui:storage:updated', updateTotals)
		}
	}, [])

	return totals
}
