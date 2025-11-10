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
import { BuildingManager } from "../Buildings"
import { dialogueCompose } from "../Dialogue/utils"
import { DialogueTree } from "../Dialogue/types"
import { GameContent, ScheduleOptions, Trigger } from "../types"

export class ContentLoader {
	constructor(
		private content: GameContent,
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
		private building: BuildingManager,
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
			this.loadAffinityWeights(),
			this.loadBuildings()
		])
		if (this.debug) {
			console.log('[ContentLoader] Finished loading all content')
		}
	}

	private async loadMaps() {
		if (this.debug) {
			console.log('[ContentLoader] Loading maps')
		}
		await this.map.loadMaps(this.content.maps)
		
		// If content specifies a default map, set it after maps are loaded
		if (this.content.defaultMap) {
			if (this.debug) {
				console.log(`[ContentLoader] Setting default map to: ${this.content.defaultMap}`)
			}
			this.map.setDefaultMapId(this.content.defaultMap)
		}
	}

	private async loadItems() {
		if (this.debug) {
			console.log('[ContentLoader] Loading items:', this.content.items)
		}
		await this.item.loadItems(this.content.items || [])
	}

	private async loadQuests() {
		if (this.debug) {
			console.log('[ContentLoader] Loading quests:', this.content.quests)
		}
		await this.quest.loadQuests(this.content.quests || [])
	}

	private async loadNPCs() {
		if (this.debug) {
			console.log('[ContentLoader] Loading NPCs:', this.content.npcs)
		}

		// Process NPCs to set interactable flag based on dialogues
		const processedNPCs = (this.content.npcs || []).map(npc => ({
			...npc,
			interactable: Boolean(npc.dialogues && npc.dialogues.length > 0)
		}))

		await this.npc.loadNPCs(processedNPCs)

		// Load NPC-specific triggers and schedules
		const npcTriggers: Trigger[] = []
		const npcSchedules: ScheduleOptions[] = []

		processedNPCs.forEach(npc => {
			// Add NPC ID to triggers and schedules for reference
			if (npc.triggers) {
				npcTriggers.push(...npc.triggers)
			}
			if (npc.schedules) {
				npcSchedules.push(...npc.schedules)
			}
		})

		// Load NPC-specific triggers
		if (npcTriggers.length > 0) {
			if (this.debug) {
				console.log('[ContentLoader] Loading NPC-specific triggers:', npcTriggers)
			}
			await this.trigger.loadTriggers(npcTriggers)
		}

		// Load NPC-specific schedules
		if (npcSchedules.length > 0) {
			if (this.debug) {
				console.log('[ContentLoader] Loading NPC-specific schedules:', npcSchedules)
			}
			await this.scheduler.loadSchedules(npcSchedules)
		}
	}

	private async loadDialogues() {
		const npcs = this.content.npcs || []
		const dialogues: DialogueTree[] = npcs
			.map((npc) => {
				if (!npc.dialogues) return undefined

				const firstDialogueId = npc.dialogues.find(d => d.id)?.id
				if (!firstDialogueId) return undefined

				return npc.dialogues.map(dialogue => dialogueCompose(
					{ id: dialogue.id || firstDialogueId, npcId: npc.id },
					dialogue
				))
			})
			.filter(Boolean)
			.flat() as DialogueTree[]

		if (this.debug) {
			console.log('[ContentLoader] Loading dialogues:', dialogues)
		}
		await this.dialogue.loadDialogues(dialogues || [])
	}

	private async loadCutscenes() {
		if (this.debug) {
			console.log('[ContentLoader] Loading cutscenes:', this.content.cutscenes)
		}
		await this.cutscene.loadCutscenes(this.content.cutscenes || [])
	}

	private async loadFlags() {
		if (this.debug) {
			console.log('[ContentLoader] Loading flags:', this.content.flags)
		}
		await this.flag.loadFlags()
	}

	private async loadSchedules() {
		if (this.debug) {
			console.log('[ContentLoader] Loading schedules:', this.content.schedules)
		}
		await this.scheduler.loadSchedules(this.content.schedules || [])
	}

	private async loadTriggers() {
		if (this.debug) {
			console.log('[ContentLoader] Loading triggers:', this.content.triggers)
		}
		await this.trigger.loadTriggers(this.content.triggers || [])
	}

	private async loadAffinityWeights() {
		const npcs = this.content.npcs || []
		const sentiments = npcs.reduce((acc, npc) => npc.sentiments ? {...acc, [npc.id]: npc.sentiments} : acc, {})
		if (this.debug) {
			console.log('[ContentLoader] Loading affinity weights:', sentiments)
		}
		await this.affinity.loadAffinityWeights(sentiments || {})
	}

	private async loadBuildings() {
		if (this.debug) {
			console.log('[ContentLoader] Loading buildings from content:', this.content.buildings)
			console.log('[ContentLoader] Buildings array length:', this.content.buildings?.length || 0)
		}
		const buildingsToLoad = this.content.buildings || []
		if (buildingsToLoad.length === 0) {
			console.warn('[ContentLoader] ⚠️ No buildings found in content! Check content/debug/general/buildings.ts')
			console.warn('[ContentLoader] Content object keys:', Object.keys(this.content))
			console.warn('[ContentLoader] Content.buildings type:', typeof this.content.buildings)
		} else {
			console.log('[ContentLoader] ✓ Found', buildingsToLoad.length, 'buildings to load')
		}
		this.building.loadBuildings(buildingsToLoad)
	}
} 