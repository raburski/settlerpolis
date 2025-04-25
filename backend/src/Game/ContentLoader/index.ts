import { AffinityManager } from "../Affinity"
import { CutsceneManager } from "../Cutscene"
import { DialogueManager } from "../Dialogue"
import { FlagsManager } from "../Flags"
import { ItemsManager } from "../Items"
import { MapManager } from "../Map"
import { NPCManager } from "../NPC"
import { QuestManager } from "../Quest"
import { Scheduler } from "../Scheduler"
import { TriggerManager } from "../Triggers"

import { cutscenes, flags, items, npcs, quests, schedules, triggers } from '../../content'
import { dialogueCompose } from "../Dialogue/utils"
import { DialogueTree } from "../Dialogue/types"

export class ContentLoader {
	constructor(
		private cutscene: CutsceneManager,
		private dialogue: DialogueManager,
		private flag: FlagsManager,
		private item: ItemsManager,
		private map: MapManager,
		private npc: NPCManager,
		private quest: QuestManager,
		private scheduler: Scheduler,
		private trigger: TriggerManager,
		private affinity: AffinityManager,
		private debug: boolean = true
	) {
        this.loadAllContent()
	}

	public async loadAllContent() {
		if (this.debug) {
			console.log('[ContentLoader] Starting to load all content')
		}
		await Promise.all([
			this.loadMaps(),
			this.loadItems(),
			this.loadQuests(),
			this.loadNPCs(),
            this.loadDialogues(),
			this.loadCutscenes(),
			this.loadFlags(),
			this.loadSchedules(),
			this.loadTriggers(),
			this.loadAffinityWeights()
		])
		if (this.debug) {
			console.log('[ContentLoader] Finished loading all content')
		}
	}

	private async loadMaps() {
		if (this.debug) {
			console.log('[ContentLoader] Loading maps')
		}
		// Merge general and chapter maps
		// const allMaps = {
		// 	...generalMaps
		// }
		// await this.map.loadMaps(allMaps)
	}

	private async loadItems() {
		if (this.debug) {
			console.log('[ContentLoader] Loading items:', items)
		}
		await this.item.loadItems(items)
	}

	private async loadQuests() {
		if (this.debug) {
			console.log('[ContentLoader] Loading quests:', quests)
		}
		await this.quest.loadQuests(quests)
	}

	private async loadNPCs() {
		if (this.debug) {
			console.log('[ContentLoader] Loading NPCs:', npcs)
		}
		await this.npc.loadNPCs(npcs)
	}

    private async loadDialogues() {
        const dialogues: DialogueTree[] = npcs
            .map((npc) => npc.dialogues ? dialogueCompose({ id: `${npc.id}_dialogues`, npcId: npc.id }, ...npc.dialogues) : undefined)
            .filter(Boolean) as DialogueTree[]

		if (this.debug) {
			console.log('[ContentLoader] Loading dialogues:', dialogues)
		}
		await this.dialogue.loadDialogues(dialogues)
	}

	private async loadCutscenes() {
		if (this.debug) {
			console.log('[ContentLoader] Loading cutscenes:', cutscenes)
		}
		await this.cutscene.loadCutscenes(cutscenes)
	}

	private async loadFlags() {
		if (this.debug) {
			console.log('[ContentLoader] Loading flags:', flags)
		}
		await this.flag.loadFlags()
	}

	private async loadSchedules() {
		if (this.debug) {
			console.log('[ContentLoader] Loading schedules:', schedules)
		}
		await this.scheduler.loadSchedules(schedules)
	}

	private async loadTriggers() {
		if (this.debug) {
			console.log('[ContentLoader] Loading triggers:', triggers)
		}
		await this.trigger.loadTriggers(triggers)
	}

	private async loadAffinityWeights() {
        const sentiments = npcs.reduce((acc, npc) => npc.sentiments ? {...acc, [npc.id]: npc.sentiments} : acc, {})
		if (this.debug) {
			console.log('[ContentLoader] Loading affinity weights:', sentiments)
		}
		await this.affinity.loadAffinityWeights(sentiments)
	}
} 