import type { EventManager } from '../events'
import { Receiver } from '../Receiver'
import type { MapId } from '../ids'
import type { Position } from '../types'
import type { MoveTargetType } from './types'
import { MovementEvents } from './events'

export class MovementEventPublisher {
	constructor(private readonly eventManager: EventManager) {}

	public emitMoveToPosition(entityId: string, targetPosition: Position, mapId: MapId, speed: number): void {
		this.eventManager.emit(Receiver.Group, MovementEvents.SC.MoveToPosition, {
			entityId,
			targetPosition,
			mapId,
			speed
		}, mapId)
	}

	public emitPositionUpdated(entityId: string, position: Position, mapId: MapId): void {
		this.eventManager.emit(Receiver.Group, MovementEvents.SC.PositionUpdated, {
			entityId,
			position,
			mapId
		}, mapId)
	}

	public emitPaused(entityId: string, position: Position, mapId: MapId): void {
		this.eventManager.emit(Receiver.Group, MovementEvents.SC.Paused, {
			entityId,
			position,
			mapId
		}, mapId)
	}

	public emitSegmentComplete(entityId: string, position: Position, segmentDistance: number, totalDistance: number): void {
		this.eventManager.emit(Receiver.All, MovementEvents.SS.SegmentComplete, {
			entityId,
			position,
			segmentDistance,
			totalDistance
		})
	}

	public emitStepComplete(entityId: string, position: Position): void {
		this.eventManager.emit(Receiver.All, MovementEvents.SS.StepComplete, {
			entityId,
			position
		})
	}

	public emitPathComplete(entityId: string, targetType?: MoveTargetType, targetId?: string): void {
		this.eventManager.emit(Receiver.All, MovementEvents.SS.PathComplete, {
			entityId,
			targetType,
			targetId
		})
	}

	public emitYieldRequested(
		requesterEntityId: string,
		blockerEntityId: string,
		mapId: MapId,
		tile: { x: number, y: number }
	): void {
		this.eventManager.emit(Receiver.All, MovementEvents.SS.YieldRequested, {
			requesterEntityId,
			blockerEntityId,
			mapId,
			tile
		})
	}
}
