import { NPCView } from './View'
import { Event, NPC } from '@rugged/game'
import { EventBus } from '../../EventBus'
import type { GameScene } from '../../scenes/base/GameScene'
import { tutorialService, TutorialFlag } from '../../services/TutorialService'

export class NPCController {
	constructor(public view: NPCView, private scene: GameScene, public npc: NPC) {
		EventBus.on(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.on(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
		EventBus.on(Event.NPC.SC.Message, this.handleNPCMessage, this)
	}

	public handleInteraction = () => {
		EventBus.emit(Event.NPC.CS.Interact, { npcId: this.npc.id })
		tutorialService.complete(TutorialFlag.NPCInteract)
	}

	private handleNPCMessage = (data: { npcId: string; message?: string; emoji?: string }) => {
		if (data.npcId !== this.npc.id) return
		if (!this.scene.textDisplayService) return

		if (data.emoji && !data.message) {
			this.scene.textDisplayService.displayEmoji({
				message: data.emoji,
				worldPosition: { x: this.view.x, y: this.view.y },
				entityId: this.npc.id
			})
		} else if (data.message) {
			this.scene.textDisplayService.displayMessage({
				message: data.message,
				worldPosition: { x: this.view.x, y: this.view.y },
				entityId: this.npc.id
			})
		}
	}

	private handleMoveToPosition = (data: { entityId: string; targetPosition: { x: number; y: number }; mapId: string; speed?: number }) => {
		if (data.entityId === this.npc.id && data.mapId === this.npc.mapId) {
			if (typeof data.speed === 'number') {
				this.view.setSpeed(data.speed)
			}
			this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
			this.scene.textDisplayService?.updateEntityPosition(this.npc.id, data.targetPosition)
		}
	}

	private handlePositionUpdated = (data: { entityId: string; position: { x: number; y: number }; mapId: string }) => {
		if (data.entityId === this.npc.id && data.mapId === this.npc.mapId) {
			this.view.updatePosition(data.position.x, data.position.y)
			this.scene.textDisplayService?.updateEntityPosition(this.npc.id, data.position)
		}
	}

	public update(_deltaMs: number): void {
		void _deltaMs
		this.view.preUpdate()
	}

	public updateNPC(npcData: NPC) {
		this.npc = npcData
		this.view.updatePosition(npcData.position.x, npcData.position.y)
	}

	public destroy(): void {
		EventBus.off(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
		EventBus.off(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
		EventBus.off(Event.NPC.SC.Message, this.handleNPCMessage, this)
		this.scene.textDisplayService?.cleanupEntityTexts(this.npc.id)
		this.view.destroy()
	}
}
