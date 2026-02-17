import type { MovementEntity, MovementTask } from './types'
import type { MovementSnapshot, MovementTaskSnapshot } from '../state/types'

export class MovementManagerState {
	public entities: Map<string, MovementEntity> = new Map()
	public tasks: Map<string, MovementTask> = new Map()
	public simulationTimeMs = 0

	public serialize(): MovementSnapshot {
		const activeMoves: MovementTaskSnapshot[] = []
		for (const task of this.tasks.values()) {
			const lastStep = task.path.length > 0 ? task.path[task.path.length - 1] : this.entities.get(task.entityId)?.position
			if (!lastStep) {
				continue
			}
			activeMoves.push({
				entityId: task.entityId,
				targetPosition: { ...lastStep },
				targetType: task.targetType,
				targetId: task.targetId
			})
		}

		return {
			entities: Array.from(this.entities.values()).map(entity => ({
				...entity,
				position: { ...entity.position }
			})),
			activeMoves,
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: MovementSnapshot): MovementTaskSnapshot[] {
		this.entities.clear()
		this.tasks.clear()
		for (const entity of state.entities) {
			this.entities.set(entity.id, {
				...entity,
				position: { ...entity.position }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
		return state.activeMoves ?? []
	}

	public reset(): void {
		this.entities.clear()
		this.tasks.clear()
		this.simulationTimeMs = 0
	}
}
