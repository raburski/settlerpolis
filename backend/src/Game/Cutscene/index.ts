import { EventClient, EventManager } from '../../events'
import { Receiver } from '../../Receiver'
import { CutsceneEvents } from './events'
import { Cutscene, CutsceneTriggerEventData } from './types'
import { FXEvents } from '../FX/events'
import { FXType } from '../FX/types'

export class CutsceneManager {
	private cutscenes: Map<string, Cutscene> = new Map()
	private activeCutscenes: Map<string, { cutscene: Cutscene, currentStep: number }> = new Map()

	constructor(private eventManager: EventManager) {
		this.setupEventListeners()
	}

	public loadCutscenes(cutscenes: Cutscene[]) {
		cutscenes.forEach(cutscene => {
			this.cutscenes.set(cutscene.id, cutscene)
		})
	}

	private setupEventListeners() {
		this.eventManager.on<CutsceneTriggerEventData>(CutsceneEvents.SS.Trigger, (data, client) => {
			this.startCutscene(client, data.cutsceneId)
		})
	}

	private startCutscene(client: EventClient, cutsceneId: string) {
		const cutscene = this.cutscenes.get(cutsceneId)
		
		if (!cutscene) {
			console.error(`Cutscene with ID ${cutsceneId} not found`)
			return
		}

		// Store the active cutscene
		this.activeCutscenes.set(client.id, {
			cutscene,
			currentStep: 0
		})

		// Start the first step
		this.executeStep(client)
	}

	private executeStep(client: EventClient) {
		const activeCutscene = this.activeCutscenes.get(client.id)
		
		if (!activeCutscene) {
			return
		}

		const { cutscene, currentStep } = activeCutscene
		
		if (currentStep >= cutscene.steps.length) {
			// Cutscene is complete
			this.endCutscene(client)
			return
		}

		const step = cutscene.steps[currentStep]
		
		// Execute the step by emitting the event directly
		const payload = step.payload ? { duration: step.duration, ...step.payload } : { duration: step.duration }
		client.emit(Receiver.Sender, step.event, payload)

		// Move to the next step after the specified duration or default to 0ms
		const duration = step.duration || 0
		setTimeout(() => {
			this.nextStep(client)
		}, duration)
	}

	private nextStep(client: EventClient) {
		const activeCutscene = this.activeCutscenes.get(client.id)
		
		if (!activeCutscene) {
			return
		}

		activeCutscene.currentStep++
		this.executeStep(client)
	}

	private endCutscene(client: EventClient) {
		const activeCutscene = this.activeCutscenes.get(client.id)
		
		if (!activeCutscene) {
			return
		}

		// Remove the active cutscene
		this.activeCutscenes.delete(client.id)
	}
} 