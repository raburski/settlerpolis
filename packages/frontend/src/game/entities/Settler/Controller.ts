import { Scene } from 'phaser'
import { SettlerView } from './View'
import { Event, Settler, ProfessionType, SettlerState } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { GameScene } from '../../scenes/base/GameScene'

export class SettlerController {
	constructor(
		private view: SettlerView,
		private scene: GameScene,
		public settler: Settler
	) {
		// Subscribe to movement events (unified movement system)
		EventBus.on(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.on(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
		
		// Subscribe to settler-specific events
		EventBus.on(Event.Population.SC.ProfessionChanged, this.handleProfessionChanged, this)
		EventBus.on(Event.Population.SC.SettlerUpdated, this.handleSettlerUpdated, this)
		EventBus.on(Event.Population.SC.WorkerAssigned, this.handleWorkerAssigned, this)
		EventBus.on(Event.Population.SC.WorkerUnassigned, this.handleWorkerUnassigned, this)
	}

	private handleMoveToPosition = (data: { entityId: string, targetPosition: { x: number, y: number }, mapName: string }) => {
		// Only update if it's our settler and on the same map
		if (data.entityId === this.settler.id) {
			if (data.mapName === this.settler.mapName) {
				// Update settler position for interpolation
				this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
				// Note: We don't update settler.position here - the view will interpolate
			} else {
				console.warn(`[SettlerController] Map name mismatch for settler ${data.entityId}: event mapName=${data.mapName}, settler mapName=${this.settler.mapName}`)
			}
		}
	}

	private handlePositionUpdated = (data: { entityId: string, position: { x: number, y: number }, mapName: string }) => {
		// Only update if it's our settler and on the same map
		if (data.entityId === this.settler.id && data.mapName === this.settler.mapName) {
			// Immediate position update (teleport/sync, no interpolation)
			this.view.updatePosition(data.position.x, data.position.y)
			this.settler.position = data.position
		}
	}

	private handleProfessionChanged = (data: { settlerId: string, oldProfession: ProfessionType, newProfession: ProfessionType }) => {
		// Only update if it's our settler
		if (data.settlerId === this.settler.id) {
			this.view.updateProfession(data.newProfession)
			this.settler.profession = data.newProfession
		}
	}

	private handleWorkerAssigned = (data: { jobAssignment: any, settlerId: string, buildingInstanceId: string }) => {
		if (data.settlerId === this.settler.id) {
			this.settler.currentJob = data.jobAssignment
			this.settler.buildingId = data.buildingInstanceId
			this.settler.state = SettlerState.Working
			this.view.updateState(SettlerState.Working)
		}
	}

	private handleWorkerUnassigned = (data: { settlerId: string }) => {
		if (data.settlerId === this.settler.id) {
			this.settler.currentJob = undefined
			this.settler.buildingId = undefined
			this.settler.state = SettlerState.Idle
			this.view.updateState(SettlerState.Idle)
		}
	}

	private handleSettlerUpdated = (data: { settler: Settler }) => {
		// Only update if it's our settler
		if (data.settler.id === this.settler.id) {
			// Update settler data (but don't update position if moving - let MoveToPosition events handle that)
			this.updateSettler(data.settler)
		}
	}

	public update(): void {
		this.view.preUpdate()
	}

	public updateSettler(settlerData: Settler): void {
		// Update settler object reference
		this.settler = settlerData
		
		// Only update position if settler is not in a moving state
		// During movement, position updates should come from MoveToPosition events to allow smooth interpolation
		const isMoving = settlerData.state === SettlerState.MovingToItem || 
		                 settlerData.state === SettlerState.CarryingItem ||
		                 settlerData.state === SettlerState.MovingToBuilding ||
		                 settlerData.state === SettlerState.MovingToTool
		
		if (!isMoving) {
			// Not moving - check if position has changed significantly before updating
			// This prevents micro-jumps from floating point precision issues or event ordering
			const positionDiff = Math.abs(this.view.x - settlerData.position.x) + Math.abs(this.view.y - settlerData.position.y)
			const POSITION_THRESHOLD = 2 // Only update if position difference is more than 2 pixels
			
			if (positionDiff > POSITION_THRESHOLD) {
				// Position has changed significantly - update it
				this.view.updatePosition(settlerData.position.x, settlerData.position.y)
				this.settler.position = settlerData.position
			} else {
				// Position is very close - just sync the settler object's position without updating view
				// This prevents visual jumps from PositionUpdated -> SettlerUpdated event ordering
				this.settler.position = settlerData.position
			}
		} else {
			// Moving - don't update position, let MoveToPosition events handle interpolation
			// But sync the settler object's position for state tracking
			this.settler.position = settlerData.position
		}
		
		// Always update state and profession
		this.view.updateState(settlerData.state)
		this.view.updateProfession(settlerData.profession)
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.off(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
		EventBus.off(Event.Population.SC.ProfessionChanged, this.handleProfessionChanged, this)
		EventBus.off(Event.Population.SC.SettlerUpdated, this.handleSettlerUpdated, this)
		EventBus.off(Event.Population.SC.WorkerAssigned, this.handleWorkerAssigned, this)
		EventBus.off(Event.Population.SC.WorkerUnassigned, this.handleWorkerUnassigned, this)
		// Destroy the view
		this.view.destroy()
	}
}

