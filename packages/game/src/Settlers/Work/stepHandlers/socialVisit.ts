import { SettlerState } from '../../../Population/types'
import { SettlerActionType } from '../../Actions/types'
import type { SettlerAction } from '../../Actions/types'
import { WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

const SOCIAL_MIN_SEGMENT_MS = 2_000
const SOCIAL_MAX_SEGMENT_MS = 6_500
const SOCIAL_MAX_SEGMENTS = 8

export const SocialVisitHandler: StepHandler = {
	type: WorkStepType.SocialVisit,
	build: ({ step, managers, settlerId, simulationTimeMs }): StepHandlerResult => {
		if (step.type !== WorkStepType.SocialVisit) {
			return { actions: [] }
		}

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			return { actions: [] }
		}

		const definition = managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return { actions: [] }
		}
		const outsideSlots = Math.max(0, definition.occupancy?.outsideSlots?.count ?? 0)
		const insideCapacity = Math.max(0, definition.occupancy?.insideCapacity ?? 0)
		const totalCapacity = Math.max(
			0,
			definition.occupancy?.totalCapacity ?? (outsideSlots + insideCapacity)
		)
		const supportsOutside = outsideSlots > 0 && totalCapacity > 0
		const supportsInside = insideCapacity > 0 && totalCapacity > 0
		if (!supportsInside && !supportsOutside) {
			return { actions: [] }
		}
		const seedBase = `${settlerId}:${building.id}:${simulationTimeMs}`
		let activeMode: 'inside' | 'outside' = pickStartMode(seedBase, supportsInside, supportsOutside)
		let remainingMs = Math.max(1_000, step.dwellTimeMs)
		let segmentIndex = 0
		const actions: SettlerAction[] = []

		while (remainingMs > 0) {
			segmentIndex += 1
			const isLastSegment = remainingMs <= SOCIAL_MIN_SEGMENT_MS || segmentIndex >= SOCIAL_MAX_SEGMENTS
			const durationMs = isLastSegment
				? remainingMs
				: Math.min(
					remainingMs,
					randomInt(seedBase, segmentIndex, SOCIAL_MIN_SEGMENT_MS, SOCIAL_MAX_SEGMENT_MS)
				)
			actions.push({
				type: SettlerActionType.Socialize,
				buildingInstanceId: building.id,
				durationMs,
				mode: activeMode,
				setState: SettlerState.Working
			})
			remainingMs -= durationMs
			if (remainingMs <= 0 || isLastSegment) {
				break
			}
			if (supportsInside && supportsOutside) {
				activeMode = activeMode === 'inside' ? 'outside' : 'inside'
				continue
			}
			activeMode = supportsInside ? 'inside' : 'outside'
		}

		return { actions }
	}
}

const pickStartMode = (
	seedBase: string,
	supportsInside: boolean,
	supportsOutside: boolean
): 'inside' | 'outside' => {
	if (!supportsInside) {
		return 'outside'
	}
	if (!supportsOutside) {
		return 'inside'
	}
	return hashToUnit(`${seedBase}:start-mode`) < 0.6 ? 'inside' : 'outside'
}

const randomInt = (seedBase: string, index: number, min: number, max: number): number => {
	if (max <= min) {
		return min
	}
	const unit = hashToUnit(`${seedBase}:segment:${index}`)
	return min + Math.floor(unit * (max - min + 1))
}

const hashToUnit = (seed: string): number => {
	let hash = 2166136261
	for (let i = 0; i < seed.length; i += 1) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	const normalized = (hash >>> 0) / 4294967295
	return Number.isFinite(normalized) ? normalized : 0
}
