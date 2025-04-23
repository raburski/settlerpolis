import { Condition, Effect } from '../ConditionEffect/types'

export enum TriggerOption {
	OneTime = 'oneTime',
	Random = 'random',
	Always = 'always'
}

export interface TriggerNPCProximity {
	npcId: string
	proximityRadius: number
}

export interface Trigger {
	id: string
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	npcProximity?: TriggerNPCProximity
	option?: TriggerOption
} 