export interface NeedMeter {
	value: number
	decayRatePerMs: number
	urgentThreshold: number
	criticalThreshold: number
	satisfiedThreshold: number
	modifiers?: number
}
