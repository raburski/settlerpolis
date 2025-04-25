import { ItemMetadata } from './Items/types'
import { Quest } from './Quest/types'
import { NPC } from '../types'
import { AffinitySentiments } from './Affinity/types'
import { DialogueTreePartial } from '../types'
import { Cutscene } from './Cutscene/types'
import { Flag } from './Flags/types'
import { ScheduledEvent, ScheduleOptions } from './Scheduler/types'
import { Trigger } from './Triggers/types'

export interface NPCContent extends NPC {
	sentiments?: AffinitySentiments
	dialogues?: DialogueTreePartial[]
}

export interface GameContent {
	items: ItemMetadata[]
	quests: Quest[]
	npcs: NPCContent[]
	cutscenes: Cutscene[]
	flags: Flag[]
	schedules: ScheduleOptions[]
	triggers: Trigger[]
} 