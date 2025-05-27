import { Scene, Input } from 'phaser'
import { EventBus } from "../EventBus"
import { Event } from '@rugged/game'
import { FXType } from '@rugged/game'

export class Keyboard {
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys
	private wasdKeys: {
		W: Phaser.Input.Keyboard.Key
		A: Phaser.Input.Keyboard.Key
		S: Phaser.Input.Keyboard.Key
		D: Phaser.Input.Keyboard.Key
	}
	private inventoryKey: Phaser.Input.Keyboard.Key
	private questKey: Phaser.Input.Keyboard.Key
	private chatKey: Phaser.Input.Keyboard.Key
	private spaceKey: Phaser.Input.Keyboard.Key
	private upKey: Phaser.Input.Keyboard.Key
	private downKey: Phaser.Input.Keyboard.Key
	private enterKey: Phaser.Input.Keyboard.Key
	private enabled: boolean = true
	private wasInventoryPressed: boolean = false
	private wasQuestPressed: boolean = false
	private wasChatPressed: boolean = false
	private wasEnterPressed: boolean = false
	private wasSpacePressed: boolean = false
	private wasUpPressed: boolean = false
	private wasDownPressed: boolean = false
	private isInDialogue: boolean = false

	constructor(private scene: Scene) {
		this.cursors = scene.input.keyboard.createCursorKeys()
		
		// Add WASD keys
		this.wasdKeys = scene.input.keyboard.addKeys({
			W: Input.Keyboard.KeyCodes.W,
			A: Input.Keyboard.KeyCodes.A,
			S: Input.Keyboard.KeyCodes.S,
			D: Input.Keyboard.KeyCodes.D
		}) as {
			W: Phaser.Input.Keyboard.Key
			A: Phaser.Input.Keyboard.Key
			S: Phaser.Input.Keyboard.Key
			D: Phaser.Input.Keyboard.Key
		}

		// Add inventory, quest and chat keys
		this.inventoryKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.I)
		this.questKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.Q)
		this.chatKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ENTER)

		// Add dialogue-related keys
		this.spaceKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.SPACE)
		this.upKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.UP)
		this.downKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.DOWN)
		this.enterKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ENTER)

		// Listen for chat input visibility changes
		EventBus.on('ui:chat:toggle', this.handleChatInputVisible, this)

		// Listen for EnableControls event
		EventBus.on(Event.FX.SC.Play, this.handleFXEvent, this)

		// Listen for dialogue events
		EventBus.on(Event.Dialogue.SC.Trigger, this.handleDialogueTrigger, this)
		EventBus.on(Event.Dialogue.SC.End, this.handleDialogueEnd, this)
	}

	private handleFXEvent = (data: { type: FXType, enabled?: boolean }) => {
		if (data.type === FXType.EnableControls) {
			this.toggleKeys(data.enabled ?? true)
		}
	}

	private handleDialogueTrigger = () => {
		this.isInDialogue = true
	}

	private handleDialogueEnd = () => {
		this.isInDialogue = false
	}

	public update() {
		if (!this.enabled) return

		// Handle dialogue keyboard input
		if (this.isInDialogue) {
			// Handle space to skip animation
			if (this.spaceKey.isDown && !this.wasSpacePressed) {
				EventBus.emit('ui:dialogue:skip-animation')
			}

			// Handle arrow keys for option selection
			if (this.upKey.isDown && !this.wasUpPressed) {
				EventBus.emit('ui:dialogue:option:up')
			}
			if (this.downKey.isDown && !this.wasDownPressed) {
				EventBus.emit('ui:dialogue:option:down')
			}
			if (this.enterKey.isDown && !this.wasEnterPressed) {
				EventBus.emit('ui:dialogue:option:confirm')
			}

			// Update was pressed states
			this.wasSpacePressed = this.spaceKey.isDown
			this.wasUpPressed = this.upKey.isDown
			this.wasDownPressed = this.downKey.isDown
			this.wasEnterPressed = this.enterKey.isDown
			this.wasChatPressed = this.chatKey.isDown // Track chat key state even in dialogue
			return // Skip other keyboard handling during dialogue
		}

		// Handle regular keyboard input
		if (this.inventoryKey.isDown && !this.wasInventoryPressed) {
			EventBus.emit('ui:inventory:toggle')
		}
		if (this.questKey.isDown && !this.wasQuestPressed) {
			EventBus.emit('ui:quests:toggle')
		}
		if (this.chatKey.isDown && !this.wasChatPressed) {
			EventBus.emit('ui:chat:toggle', this.chatKey.isDown)
		}

		// Update was pressed states
		this.wasInventoryPressed = this.inventoryKey.isDown
		this.wasQuestPressed = this.questKey.isDown
		this.wasChatPressed = this.chatKey.isDown
		this.wasEnterPressed = this.enterKey.isDown
		this.wasSpacePressed = this.spaceKey.isDown
		this.wasUpPressed = this.upKey.isDown
		this.wasDownPressed = this.downKey.isDown
	}

	private handleChatInputVisible = (isVisible: boolean) => {
		this.toggleKeys(!isVisible)
	}

	public toggleKeys(enable: boolean) {
		this.enabled = enable
		this.scene.input.keyboard.enabled = enable
		if (enable) {
			this.scene.input.keyboard.enableGlobalCapture()
		} else {
			this.scene.input.keyboard.disableGlobalCapture()
		}
	}

	public isMovingLeft(): boolean {
		return this.enabled && !this.isInDialogue && (this.cursors.left.isDown || this.wasdKeys.A.isDown)
	}

	public isMovingRight(): boolean {
		return this.enabled && !this.isInDialogue && (this.cursors.right.isDown || this.wasdKeys.D.isDown)
	}

	public isMovingUp(): boolean {
		return this.enabled && !this.isInDialogue && (this.cursors.up.isDown || this.wasdKeys.W.isDown)
	}

	public isMovingDown(): boolean {
		return this.enabled && !this.isInDialogue && (this.cursors.down.isDown || this.wasdKeys.S.isDown)
	}

	public isInventoryPressed(): boolean {
		return this.enabled && !this.isInDialogue && Phaser.Input.Keyboard.JustDown(this.inventoryKey)
	}

	public isQuestPressed(): boolean {
		return this.enabled && !this.isInDialogue && Phaser.Input.Keyboard.JustDown(this.questKey)
	}

	public isAnyMovementKeyPressed(): boolean {
		return this.isMovingLeft() || this.isMovingRight() || this.isMovingUp() || this.isMovingDown()
	}

	public destroy(): void {
		EventBus.off('ui:chat:toggle', this.handleChatInputVisible, this)
		EventBus.off(Event.FX.SC.Play, this.handleFXEvent, this)
		EventBus.off(Event.Dialogue.SC.Trigger, this.handleDialogueTrigger, this)
		EventBus.off(Event.Dialogue.SC.End, this.handleDialogueEnd, this)
	}
} 