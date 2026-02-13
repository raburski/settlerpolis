import { SettlerView } from './View'
import { Event, Settler, SettlerPatch, ProfessionType, SettlerState, NeedType } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import type { GameScene } from '../../scenes/base/GameScene'

export class SettlerController {
	constructor(public view: SettlerView, private scene: GameScene, public settler: Settler) {
		EventBus.on(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.on(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)

			EventBus.on(Event.Population.SC.ProfessionChanged, this.handleProfessionChanged, this)
			EventBus.on(Event.Population.SC.SettlerUpdated, this.handleSettlerUpdated, this)
			EventBus.on(Event.Population.SC.SettlerPatched, this.handleSettlerPatched, this)
			EventBus.on(Event.Population.SC.WorkerAssigned, this.handleWorkerAssigned, this)
			EventBus.on(Event.Population.SC.WorkerUnassigned, this.handleWorkerUnassigned, this)
		EventBus.on(UiEvents.Settler.Highlight, this.handleHighlight, this)
		EventBus.on(Event.Needs.SS.NeedInterruptStarted, this.handleNeedInterruptStarted, this)
		EventBus.on(Event.Needs.SS.NeedInterruptEnded, this.handleNeedInterruptEnded, this)

		this.view.updateState(this.settler.state)
		this.view.updateCarriedItem(this.settler.state === SettlerState.CarryingItem ? this.settler.stateContext.carryingItemType : undefined)
		this.view.updateNeeds(this.settler.needs)
		this.view.updateHealth(this.settler.health)
	}

	private handleMoveToPosition = (data: { entityId: string; targetPosition: { x: number; y: number }; mapId: string; speed?: number }) => {
		if (data.entityId === this.settler.id) {
			if (data.mapId === this.settler.mapId) {
				if (typeof data.speed === 'number') {
					this.view.setSpeed(data.speed)
				}
				this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
			} else {
				console.warn(`[SettlerController] Map name mismatch for settler ${data.entityId}: event mapId=${data.mapId}, settler mapId=${this.settler.mapId}`)
			}
		}
	}

	private handlePositionUpdated = (data: { entityId: string; position: { x: number; y: number }; mapId: string }) => {
		if (data.entityId === this.settler.id && data.mapId === this.settler.mapId) {
			this.view.updatePosition(data.position.x, data.position.y)
			this.settler.position = data.position
		}
	}

	private handleProfessionChanged = (data: { settlerId: string; oldProfession: ProfessionType; newProfession: ProfessionType }) => {
		if (data.settlerId === this.settler.id) {
			this.view.updateProfession(data.newProfession)
			this.settler.profession = data.newProfession
		}
	}

	private handleWorkerAssigned = (data: { assignment: any; settlerId: string; buildingInstanceId: string }) => {
		if (data.settlerId === this.settler.id) {
			this.settler.stateContext = { ...this.settler.stateContext, assignmentId: data.assignment.assignmentId }
			this.settler.buildingId = data.buildingInstanceId
		}
	}

	private handleWorkerUnassigned = (data: { settlerId: string; assignmentId: string }) => {
		if (data.settlerId === this.settler.id) {
			this.settler.stateContext = { ...this.settler.stateContext, assignmentId: undefined }
			this.settler.buildingId = undefined
			this.settler.state = SettlerState.Idle
			this.view.updateState(SettlerState.Idle)
		}
	}

	private handleSettlerUpdated = (data: { settler: Settler }) => {
		if (data.settler.id === this.settler.id) {
			this.updateSettler(data.settler)
		}
	}

	private handleSettlerPatched = (data: { settlerId: string, patch: SettlerPatch }) => {
		if (data.settlerId !== this.settler.id) {
			return
		}

		const patch = data.patch
		const updated: Settler = {
			...this.settler,
			position: patch.position ? { ...patch.position } : this.settler.position
		}

		if (patch.state !== undefined) {
			updated.state = patch.state
		}
		if (patch.profession !== undefined) {
			updated.profession = patch.profession
		}
		if (patch.health !== undefined) {
			updated.health = patch.health
		}
		if (patch.needs !== undefined) {
			updated.needs = {
				hunger: patch.needs.hunger,
				fatigue: patch.needs.fatigue
			}
		}
		if (patch.stateContext !== undefined) {
			updated.stateContext = {
				...this.settler.stateContext,
				...patch.stateContext
			}
		}
		if ('buildingId' in patch) {
			updated.buildingId = patch.buildingId
		}
		if ('houseId' in patch) {
			updated.houseId = patch.houseId
		}

		this.updateSettler(updated)
	}

	private handleHighlight = (data: { settlerId: string; highlighted: boolean }) => {
		if (data.settlerId === this.settler.id) {
			this.view.setHighlighted(data.highlighted)
		}
	}

	private handleNeedInterruptStarted = (data: { settlerId: string; needType: NeedType }) => {
		if (data.settlerId !== this.settler.id) return
		const kind = data.needType === NeedType.Hunger ? 'hunger' : data.needType === NeedType.Fatigue ? 'fatigue' : null
		this.view.updateNeedActivity(kind)
	}

	private handleNeedInterruptEnded = (data: { settlerId: string }) => {
		if (data.settlerId === this.settler.id) {
			this.view.updateNeedActivity(null)
		}
	}

	public update(_deltaMs: number): void {
		void _deltaMs
		this.view.preUpdate()
	}

	public updateSettler(settlerData: Settler): void {
		this.settler = settlerData

		const isMoving =
			settlerData.state === SettlerState.Moving ||
			settlerData.state === SettlerState.MovingToItem ||
			settlerData.state === SettlerState.CarryingItem ||
			settlerData.state === SettlerState.MovingToBuilding ||
			settlerData.state === SettlerState.MovingToTool ||
			settlerData.state === SettlerState.MovingToResource

		if (!isMoving) {
			const positionDiff = Math.abs(this.view.x - settlerData.position.x) + Math.abs(this.view.y - settlerData.position.y)
			const POSITION_THRESHOLD = 2
			if (positionDiff > POSITION_THRESHOLD) {
				this.view.updatePosition(settlerData.position.x, settlerData.position.y)
				this.settler.position = settlerData.position
			} else {
				this.settler.position = settlerData.position
			}
		} else {
			this.settler.position = settlerData.position
		}

		this.view.updateState(settlerData.state)
		this.view.updateProfession(settlerData.profession)
		this.view.updateCarriedItem(settlerData.state === SettlerState.CarryingItem ? settlerData.stateContext.carryingItemType : undefined)
		this.view.updateNeeds(settlerData.needs)
		this.view.updateHealth(settlerData.health)
	}

	public destroy(): void {
		EventBus.off(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.off(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
			EventBus.off(Event.Population.SC.ProfessionChanged, this.handleProfessionChanged, this)
			EventBus.off(Event.Population.SC.SettlerUpdated, this.handleSettlerUpdated, this)
			EventBus.off(Event.Population.SC.SettlerPatched, this.handleSettlerPatched, this)
			EventBus.off(Event.Population.SC.WorkerAssigned, this.handleWorkerAssigned, this)
			EventBus.off(Event.Population.SC.WorkerUnassigned, this.handleWorkerUnassigned, this)
		EventBus.off(UiEvents.Settler.Highlight, this.handleHighlight, this)
		EventBus.off(Event.Needs.SS.NeedInterruptStarted, this.handleNeedInterruptStarted, this)
		EventBus.off(Event.Needs.SS.NeedInterruptEnded, this.handleNeedInterruptEnded, this)
		this.view.destroy()
	}
}
