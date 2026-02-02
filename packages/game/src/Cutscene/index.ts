import { EventClient, EventManager } from '../events'
import { CutsceneEvents } from './events'
import { Cutscene, CutsceneTriggerEventData } from './types'
import { FXEvents } from '../FX/events'
import { FXType } from '../FX/types'
import { Receiver } from "../Receiver"
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'

export class CutsceneManager {
	private cutscenes: Map<string, Cutscene> = new Map()
	private activeCutscenes: Map<string, { cutscene: Cutscene, currentStep: number, nextStepAtMs?: number, client: EventClient }> = new Map()
	private simulationTimeMs = 0

	constructor(
		private eventManager: EventManager,
		private logger: Logger
	) {
		this.setupEventListeners()
	}

	public loadCutscenes(cutscenes: Cutscene[]) {
		cutscenes.forEach(cutscene => {
			this.cutscenes.set(cutscene.id, cutscene)
		})
	}

	private setupEventListeners() {
		this.eventManager.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})

		this.eventManager.on<CutsceneTriggerEventData>(CutsceneEvents.SS.Trigger, (data, client) => {
			this.startCutscene(client, data.cutsceneId)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.processActiveCutscenes()
	}

	private processActiveCutscenes(): void {
		for (const [clientId, active] of this.activeCutscenes.entries()) {
			if (active.currentStep >= active.cutscene.steps.length) {
				this.activeCutscenes.delete(clientId)
				continue
			}
			if (active.nextStepAtMs === undefined || this.simulationTimeMs < active.nextStepAtMs) {
				continue
			}
			active.currentStep += 1
			this.executeStep(active.client)
		}
	}

	private startCutscene(client: EventClient, cutsceneId: string) {
		const cutscene = this.cutscenes.get(cutsceneId)
		
		if (!cutscene) {
			this.logger.error(`Cutscene with ID ${cutsceneId} not found`)
			return
		}

		// Store the active cutscene
		this.activeCutscenes.set(client.id, {
			cutscene,
			currentStep: 0,
			nextStepAtMs: this.simulationTimeMs,
			client
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
		activeCutscene.nextStepAtMs = this.simulationTimeMs + duration
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
