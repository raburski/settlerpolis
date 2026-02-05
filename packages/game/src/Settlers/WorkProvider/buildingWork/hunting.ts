import { BuildingWorkKind, getHuntingDefinition, getProductionRecipes } from '../../../Buildings/work'
import { calculateDistance } from '../../../utils'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

const DEFAULT_HUNT_TIME_MS = 3000

const hashString = (value: string): number => {
	let hash = 0
	for (let i = 0; i < value.length; i += 1) {
		hash = ((hash << 5) - hash) + value.charCodeAt(i)
		hash |= 0
	}
	return Math.abs(hash)
}

const shouldPreferProcessing = (buildingId: string, settlerId: string): boolean => {
	return hashString(`${buildingId}:${settlerId}`) % 2 === 1
}

export const HuntingWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Hunting,
	canHandle: (definition) => Boolean(getHuntingDefinition(definition)),
	getNextStep: ({ building, definition, managers, settler }) => {
		const hunting = getHuntingDefinition(definition)
		if (!hunting) {
			return null
		}

		if (settler.stateContext.carryingItemType) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.CarryingItem }
		}

		const map = managers.map.getMap(building.mapId)
		if (!map) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		const outputItemType = hunting.outputItemType
		const quantity = Math.max(1, hunting.quantity ?? 1)

		const tileSize = map.tiledMap.tilewidth || 32
		const workCenter = building.workAreaCenter ?? building.position
		const radiusTiles = Math.max(0, hunting.radiusTiles)
		const maxDistance = radiusTiles * tileSize

		const wildlifeType = hunting.wildlifeType
		const candidates = managers.npc.getMapNPCs(building.mapId)
			.filter(npc => npc.attributes?.wildlifeType === wildlifeType)
			.filter(npc => npc.active !== false)
			.filter(npc => {
				const reservedBy = npc.attributes?.reservedBy
				return !reservedBy || reservedBy === settler.id
			})
			.filter(npc => calculateDistance(workCenter, npc.position) <= maxDistance)

		let closest = candidates[0]
		if (closest) {
			let closestDistance = calculateDistance(workCenter, closest.position)
			for (let i = 1; i < candidates.length; i += 1) {
				const distance = calculateDistance(workCenter, candidates[i].position)
				if (distance < closestDistance) {
					closest = candidates[i]
					closestDistance = distance
				}
			}
		}

		const recipes = getProductionRecipes(definition)
		const canProduceNow = recipes.some(recipe => {
			for (const output of recipe.outputs) {
				if (!managers.storage.hasAvailableStorage(building.id, output.itemType, output.quantity)) {
					return false
				}
			}
			for (const input of recipe.inputs) {
				const current = managers.storage.getCurrentQuantity(building.id, input.itemType, 'incoming')
				if (current < input.quantity) {
					return false
				}
			}
			return true
		})

		if (canProduceNow && (shouldPreferProcessing(building.id, settler.id) || !closest)) {
			return null
		}

		if (!closest) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodes }
		}

		if (!managers.storage.hasAvailableStorage(building.id, outputItemType, quantity)) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoStorage }
		}

		return {
			type: WorkStepType.Hunt,
			buildingInstanceId: building.id,
			npcId: closest.id,
			outputItemType,
			quantity,
			durationMs: hunting.huntTimeMs ?? DEFAULT_HUNT_TIME_MS,
			wildlifeType
		}
	}
}
