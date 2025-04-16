export interface CutsceneStep {
	event: string
	payload?: Record<string, any>
	duration?: number // Duration in milliseconds, optional
}

export interface Cutscene {
	id: string
	skippable: boolean
	steps: CutsceneStep[]
}

export interface CutsceneTriggerEventData {
	cutsceneId: string
} 