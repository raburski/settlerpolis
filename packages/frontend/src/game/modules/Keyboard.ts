import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { FXType } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import { isTextInputActive, shouldIgnoreKeyboardEvent } from '../utils/inputGuards'

const KEY_CODES = {
	W: 'KeyW',
	A: 'KeyA',
	S: 'KeyS',
	D: 'KeyD',
	UP: 'ArrowUp',
	DOWN: 'ArrowDown',
	LEFT: 'ArrowLeft',
	RIGHT: 'ArrowRight',
	I: 'KeyI',
	Q: 'KeyQ',
	H: 'KeyH',
	ENTER: 'Enter',
	SPACE: 'Space',
	ESC: 'Escape',
	E: 'KeyE',
	MINUS: 'Minus',
	EQUAL: 'Equal'
}

export class Keyboard {
	private enabled: boolean = true
	private isInDialogue: boolean = false
	private pressed = new Set<string>()
	private prevPressed = new Set<string>()
	private boundKeyDown: (event: KeyboardEvent) => void
	private boundKeyUp: (event: KeyboardEvent) => void

	constructor() {
		this.boundKeyDown = (event) => this.onKeyDown(event)
		this.boundKeyUp = (event) => this.onKeyUp(event)
		window.addEventListener('keydown', this.boundKeyDown)
		window.addEventListener('keyup', this.boundKeyUp)

		EventBus.on(UiEvents.Chat.Toggle, this.handleChatInputVisible, this)
		EventBus.on(Event.FX.SC.Play, this.handleFXEvent, this)
		EventBus.on(Event.Dialogue.SC.Trigger, this.handleDialogueTrigger, this)
		EventBus.on(Event.Dialogue.SC.End, this.handleDialogueEnd, this)
	}

	private onKeyDown(event: KeyboardEvent) {
		if (!this.enabled) return
		if (shouldIgnoreKeyboardEvent(event)) return
		this.pressed.add(event.code)
	}

	private onKeyUp(event: KeyboardEvent) {
		this.pressed.delete(event.code)
	}

	private handleFXEvent = (data: { type: FXType; enabled?: boolean }) => {
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
		if (isTextInputActive()) {
			this.pressed.clear()
			this.prevPressed.clear()
			return
		}

		if (this.isInDialogue) {
			if (this.isJustDown(KEY_CODES.SPACE)) {
				EventBus.emit(UiEvents.Dialogue.SkipAnimation)
			}
			if (this.isJustDown(KEY_CODES.UP)) {
				EventBus.emit(UiEvents.Dialogue.OptionUp)
			}
			if (this.isJustDown(KEY_CODES.DOWN)) {
				EventBus.emit(UiEvents.Dialogue.OptionDown)
			}
			if (this.isJustDown(KEY_CODES.ENTER)) {
				EventBus.emit(UiEvents.Dialogue.OptionConfirm)
			}
			if (this.isDown(KEY_CODES.ESC)) {
				EventBus.emit(UiEvents.Dialogue.Close)
			}
			this.syncPrev()
			return
		}

		if (this.isJustDown(KEY_CODES.I)) {
			EventBus.emit(UiEvents.Inventory.Toggle)
		}
		if (this.isJustDown(KEY_CODES.ENTER)) {
			EventBus.emit(UiEvents.Chat.Toggle, true)
		}

		this.syncPrev()
	}

	private syncPrev(): void {
		this.prevPressed = new Set(this.pressed)
	}

	private isDown(code: string): boolean {
		return this.enabled && this.pressed.has(code)
	}

	private isJustDown(code: string): boolean {
		return this.enabled && this.pressed.has(code) && !this.prevPressed.has(code)
	}

	private handleChatInputVisible = (isVisible: boolean) => {
		this.toggleKeys(!isVisible)
	}

	public toggleKeys(enable: boolean) {
		this.enabled = enable
		if (!enable) {
			this.pressed.clear()
			this.prevPressed.clear()
		}
	}

	public isMovingLeft(): boolean {
		return this.enabled && !this.isInDialogue && (this.isDown(KEY_CODES.LEFT) || this.isDown(KEY_CODES.A))
	}

	public isMovingRight(): boolean {
		return this.enabled && !this.isInDialogue && (this.isDown(KEY_CODES.RIGHT) || this.isDown(KEY_CODES.D))
	}

	public isMovingUp(): boolean {
		return this.enabled && !this.isInDialogue && (this.isDown(KEY_CODES.UP) || this.isDown(KEY_CODES.W))
	}

	public isMovingDown(): boolean {
		return this.enabled && !this.isInDialogue && (this.isDown(KEY_CODES.DOWN) || this.isDown(KEY_CODES.S))
	}

	public isAnyMovementKeyPressed(): boolean {
		return this.isMovingLeft() || this.isMovingRight() || this.isMovingUp() || this.isMovingDown()
	}

	public isRotateLeft(): boolean {
		return this.enabled && !this.isInDialogue && this.isJustDown(KEY_CODES.Q)
	}

	public isRotateRight(): boolean {
		return this.enabled && !this.isInDialogue && this.isJustDown(KEY_CODES.E)
	}

	public isCameraHome(): boolean {
		return this.enabled && !this.isInDialogue && this.isJustDown(KEY_CODES.H)
	}

	public isZoomOut(): boolean {
		return this.enabled && !this.isInDialogue && this.isJustDown(KEY_CODES.MINUS)
	}

	public isZoomIn(): boolean {
		return this.enabled && !this.isInDialogue && this.isJustDown(KEY_CODES.EQUAL)
	}

	public destroy(): void {
		window.removeEventListener('keydown', this.boundKeyDown)
		window.removeEventListener('keyup', this.boundKeyUp)
		EventBus.off(UiEvents.Chat.Toggle, this.handleChatInputVisible, this)
		EventBus.off(Event.FX.SC.Play, this.handleFXEvent, this)
		EventBus.off(Event.Dialogue.SC.Trigger, this.handleDialogueTrigger, this)
		EventBus.off(Event.Dialogue.SC.End, this.handleDialogueEnd, this)
	}
}
