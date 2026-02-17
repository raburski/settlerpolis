import type { EventClient } from '../events'
import type { Cutscene } from './types'

export type ActiveCutsceneState = {
	cutscene: Cutscene
	currentStep: number
	nextStepAtMs?: number
	client: EventClient
}

export class CutsceneManagerState {
	public cutscenes: Map<string, Cutscene> = new Map()
	public activeCutscenes: Map<string, ActiveCutsceneState> = new Map()
	public simulationTimeMs = 0
}
