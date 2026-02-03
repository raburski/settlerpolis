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
import { PopulationManager } from "../Population"
import { ResourceNodesManager } from "../ResourceNodes"
import { WildlifeManager } from "../Wildlife"
import { CityCharterManager } from "../CityCharter"
import { TradeManager } from "../Trade"
import { dialogueCompose } from "../Dialogue/utils"
import { DialogueTree } from "../Dialogue/types"
import { GameContent, ScheduleOptions, Trigger } from "../types"
import { Logger } from "../Logs"

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
	private population: PopulationManager,
	private cityCharter: CityCharterManager,
	private trade: TradeManager,
	private resourceNodes: ResourceNodesManager,
	private wildlife: WildlifeManager,
	private logger: Logger
	) {
		this.loadAllContent()
	}

	public async loadAllContent() {
		this.logger.log('Starting to load all content')
		await this.loadMaps()
		await this.loadItems()
		await Promise.all([
			this.loadQuests(),
			this.loadNPCs(),
			this.loadDialogues(),
			this.loadCutscenes(),
			this.loadFlags(),
			this.loadSchedules(),
			this.loadTriggers(),
			this.loadAffinityWeights(),
			this.loadBuildings(),
			this.loadProfessions(),
			this.loadProfessionTools(),
			this.loadCityCharters(),
			this.loadWorldMap()
		])
		await this.loadResourceNodes()
		this.wildlife.initializeForestSpawns()
		this.logger.log('Finished loading all content')
	}

	private async loadMaps() {
		this.logger.debug('Loading maps')
		await this.map.loadMaps(this.content.maps)
		
		// If content specifies a default map, set it after maps are loaded
		if (this.content.defaultMap) {
			this.logger.debug(`Setting default map to: ${this.content.defaultMap}`)
			this.map.setDefaultMapId(this.content.defaultMap)
		}
	}

	private async loadItems() {
		this.logger.debug('Loading items:', this.content.items)
		await this.item.loadItems(this.content.items || [])
	}

	private async loadQuests() {
		this.logger.debug('Loading quests:', this.content.quests)
		await this.quest.loadQuests(this.content.quests || [])
	}

	private async loadNPCs() {
		this.logger.debug('Loading NPCs:', this.content.npcs)

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
			this.logger.debug('Loading NPC-specific triggers:', npcTriggers)
			await this.trigger.loadTriggers(npcTriggers)
		}

		// Load NPC-specific schedules
		if (npcSchedules.length > 0) {
			this.logger.debug('Loading NPC-specific schedules:', npcSchedules)
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

		this.logger.debug('Loading dialogues:', dialogues)
		await this.dialogue.loadDialogues(dialogues || [])
	}

	private async loadCutscenes() {
		this.logger.debug('Loading cutscenes:', this.content.cutscenes)
		await this.cutscene.loadCutscenes(this.content.cutscenes || [])
	}

	private async loadFlags() {
		this.logger.debug('Loading flags:', this.content.flags)
		await this.flag.loadFlags()
	}

	private async loadSchedules() {
		this.logger.debug('Loading schedules:', this.content.schedules)
		await this.scheduler.loadSchedules(this.content.schedules || [])
	}

	private async loadTriggers() {
		this.logger.debug('Loading triggers:', this.content.triggers)
		await this.trigger.loadTriggers(this.content.triggers || [])
	}

	private async loadAffinityWeights() {
		const npcs = this.content.npcs || []
		const sentiments = npcs.reduce((acc, npc) => npc.sentiments ? {...acc, [npc.id]: npc.sentiments} : acc, {})
		this.logger.debug('Loading affinity weights:', sentiments)
		await this.affinity.loadAffinityWeights(sentiments || {})
	}

	private async loadBuildings() {
		this.logger.debug('Loading buildings from content:', this.content.buildings)
		this.logger.debug('Buildings array length:', this.content.buildings?.length || 0)
		const buildingsToLoad = this.content.buildings || []
		if (buildingsToLoad.length === 0) {
			this.logger.warn('⚠️ No buildings found in content! Check content/settlerpolis/buildings.json')
			this.logger.warn('Content object keys:', Object.keys(this.content))
			this.logger.warn('Content.buildings type:', typeof this.content.buildings)
		} else {
			this.logger.log('✓ Found', buildingsToLoad.length, 'buildings to load')
		}
		this.building.loadBuildings(buildingsToLoad)
	}

	private async loadCityCharters() {
		this.logger.debug('Loading city charters from content:', this.content.cityCharters)
		if (this.content.cityCharters) {
			this.cityCharter.loadCharters(this.content.cityCharters)
		} else {
			this.logger.warn('No city charters found in content')
		}
	}

	private async loadWorldMap() {
		this.logger.debug('Loading world map from content:', this.content.worldMap)
		if (this.content.worldMap) {
			this.trade.loadWorldMap(this.content.worldMap)
		} else {
			this.logger.warn('No world map found in content')
		}
	}

	private async loadProfessions() {
		this.logger.debug('Loading professions from content:', this.content.professions)
		if (this.content.professions && this.content.professions.length > 0) {
			this.population.loadProfessions(this.content.professions)
		} else {
			this.logger.warn('No professions found in content')
		}
	}

	private async loadProfessionTools() {
		this.logger.debug('Loading profession tools from content:', this.content.professionTools)
		// Load profession tools from content
		const toolsFromContent = this.content.professionTools || []
		
		// Also load profession tools from items (items with changesProfession property)
		const items = this.content.items || []
		const toolsFromItems = items
			.filter(item => item.changesProfession)
			.map(item => ({
				itemType: item.id,
				targetProfession: item.changesProfession!,
				name: item.name,
				description: item.description
			}))

		// Combine both sources
		const allTools = [...toolsFromContent, ...toolsFromItems]

		if (allTools.length > 0) {
			this.population.loadProfessionTools(allTools)
		} else {
			this.logger.warn('No profession tools found in content or items')
		}
	}

	private async loadResourceNodes() {
		this.logger.debug('Loading resource nodes from content')

		if (this.content.resourceNodeDefinitions && this.content.resourceNodeDefinitions.length > 0) {
			this.resourceNodes.loadDefinitions(this.content.resourceNodeDefinitions)
		}

		if (this.content.resourceNodes && this.content.resourceNodes.length > 0) {
			this.resourceNodes.spawnNodes(this.content.resourceNodes)
		}

		this.resourceNodes.rebuildBlockingCollision()
	}
}
