import type { BehaviourIntent } from './intentTypes'

export enum IntentOrigin {
	Needs = 'needs',
	Navigation = 'navigation',
	Work = 'work',
	Behaviour = 'behaviour'
}

export interface TaggedIntent {
	origin: IntentOrigin
	intent: BehaviourIntent
	arrivalOrder: number
}

export const rankIntent = (intent: BehaviourIntent): number => intent.priority

export const rankOrigin = (origin: IntentOrigin): number => {
	if (origin === IntentOrigin.Needs) {
		return 3
	}
	if (origin === IntentOrigin.Navigation) {
		return 2
	}
	if (origin === IntentOrigin.Work) {
		return 1
	}
	return 0
}

