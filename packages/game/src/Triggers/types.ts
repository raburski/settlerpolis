import { Condition, Effect } from '../ConditionEffect/types'

export enum TriggerOption {
	OneTime = 'oneTime',
	Random = 'random',
	Always = 'always'
}

export interface Trigger {
	id: string
	option: TriggerOption
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	mapId?: string
} 