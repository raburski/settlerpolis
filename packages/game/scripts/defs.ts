/**
 * Auto-generated types and events definitions
 * Generated on: 2025-05-30T11:19:24.876Z
 */

/**
 * Content folder structure:
catch-the-rabbit/
  cutscenes/
    index.ts
    rabbit_escape.ts
  index.ts
  items/
    assets/
    carrot.ts
    index.ts
    rabbit.ts
  maps/
    assets/
    index.ts
  npcs/
    assets/
    index.ts
    miss_hilda.ts
    rabbit.ts
  quests/
    catch_the_rabbit.ts
    index.ts
  schedules/
    index.ts
  triggers/
    index.ts
    rabbit_escape.ts
debug/
  general/
    cutscenes/
      index.ts
    flags/
      index.ts
    index.ts
    items/
      index.ts
    maps/
      index.ts
    npcs/
      guard/
        dialogues.ts
        index.ts
        routine.ts
        sentiments.ts
      index.ts
      innkeeper/
        dialogues/
          freeDrink.ts
          index.ts
          mozgotrzep.ts
        index.ts
        sentiments.ts
    quests/
      index.ts
    schedules/
      index.ts
    triggers/
      index.ts
  index.ts

 */

// Types
export interface NPCContent extends NPC {
	sentiments?: AffinitySentiments
	dialogues?: DialogueTreePartial[]
	assets?: NPCAssets // Required assets for the NPC
	triggers?: Trigger[] // Optional triggers specific to this NPC
	schedules?: ScheduleOptions[] // Optional schedules specific to this NPC
}

export interface GameContent {
	items: ItemMetadata[]
	quests: Quest[]
	npcs: NPCContent[]
	cutscenes: Cutscene[]
	flags: Flag[]
	schedules: ScheduleOptions[]
	triggers: Trigger[]
	maps: Record<string, TiledMap>,
	defaultMap?: string // Optional default map ID to load initially
}

export interface Position {
	x: number
	y: number
}

// Type aliases for compatibility
export type WorldPosition = Position
export interface InventoryPosition {
	row: number
	column: number
}

// Receiver enum (from Receiver.ts)
export enum Receiver {
	Sender = 'SENDER',
	Group = 'GROUP',
	NoSenderGroup = 'NO_SENDER_GROUP',
	All = 'ALL',
	Client = 'CLIENT'
}

// Note: This file is auto-generated. Type exports are inlined here for build compatibility.
// In actual usage, import types from '../src/types' instead.

export enum AffinitySentimentType {
	Empathy = 'empathy',
	Curiosity = 'curiosity',
	Trust = 'trust',
	Devotion = 'devotion'
}

// Enum for sentiment value ranges
export enum AffinityValueRange {
	VeryNegative = 'veryNegative',
	Negative = 'negative',
	Neutral = 'neutral',
	Positive = 'positive',
	VeryPositive = 'veryPositive'
}

export enum OverallNPCApproach {
	// Basic approaches based on average sentiment
	Enemy = 'enemy',           // Average <= -75
	Rival = 'rival',          // Average <= -25
	Stranger = 'stranger',    // Average <= 25
	Acquaintance = 'acquaintance', // Average <= 75
	Friend = 'friend',        // Average > 75
	Ally = 'ally',           // Average > 90

	// Complex approaches with mixed sentiments
	Ambivalent = 'ambivalent',   // Mixed feelings (e.g., positive empathy but negative trust)
	Competitive = 'competitive', // Sees player as rival to surpass
	Obsessed = 'obsessed',      // Fixated on player for personal reasons

	// Transactional approaches
	Businesslike = 'businesslike', // Treats player as business contact
	Employing = 'employing',      // Hires player for tasks
	Working = 'working',         // Works for player
	Contracting = 'contracting',  // Temporary professional arrangement

	// Social approaches
	Indifferent = 'indifferent',  // No significant interest
	Acquainted = 'acquainted',   // Recognizes player casually
	Friendly = 'friendly',      // Likes player
	Intimate = 'intimate',      // Very close to player
	Accompanying = 'accompanying', // Travels with player

	// Trust-based approaches
	Trusting = 'trusting',    // Shares secrets and trusts player
	Mentoring = 'mentoring',    // Guides and teaches
	Learning = 'learning',      // Learns from player
	Protecting = 'protecting',  // Protects player

	// Commitment-based approaches
	Supporting = 'supporting',  // Supports player's goals
	Fighting = 'fighting',     // Fights alongside player
	Devoting = 'devoting',     // Devotes themselves to player
	Following = 'following',   // Follows player's lead

	// Hostile approaches
	Antagonistic = 'antagonistic', // Opposes player
	Vengeful = 'vengeful',       // Seeks revenge
	Hateful = 'hateful'         // Hates player deeply
}

export type AffinitySentiments = Record<AffinitySentimentType, number>
// Define the structure for affinity data
export interface AffinityData {
	playerId: string
	npcId: string
	sentiments: AffinitySentiments
	lastUpdated: number
	overallScore?: number
	approach?: OverallNPCApproach
}

// Define the structure for update event data
export interface AffinityUpdateEventData {
	playerId: string
	npcId: string
	sentimentType: AffinitySentimentType
	set?: number
	add?: number
}

// Define the structure for updated event data
export interface AffinityUpdatedEventData {
	playerId: string
	npcId: string
	sentimentType: AffinitySentimentType
	value: number
	overallScore: number
}

// Define the structure for affinity list event data
export interface AffinityListEventData {
	affinities: Array<{
		npcId: string
		approach: OverallNPCApproach
	}>
}

// Define the structure for affinity update event data (SC)
export interface AffinitySCUpdateEventData {
	npcId: string
	approach: OverallNPCApproach
}

export enum ChatMessageType {
	Local = 'local',
	System = 'system'
}

export interface ChatMessageData {
	message: string
	type: ChatMessageType
	playerId?: string
}

export interface ChatSystemMessageData {
	message: string
	type: 'warning' | 'info' | 'success' | 'error'
}

export interface TimeRange {
	before?: string // format: "HH:MM"
	after?: string // format: "HH:MM"
}

export interface DateRange {
	day?: number
	month?: number
	year?: number
	before?: {
		day?: number
		month?: number
		year?: number
	}
	after?: {
		day?: number
		month?: number
		year?: number
	}
}

export interface FlagCondition {
	exists?: string
	notExists?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestCondition {
	canStart?: string
	inProgress?: string
	completed?: string
}

export interface NPCAffinityCondition {
	sentimentType: AffinitySentimentType
	min?: number
	max?: number
}

export interface NPCAffinityOverallCondition {
	minScore?: number
	maxScore?: number
}

export interface NPCAttributeCondition {
	[attributeName: string]: {
		min?: number
		max?: number
		equals?: any
		exists?: boolean
	}
}

export interface NPCCondition {
	proximity?: number
	id: string
	affinity?: NPCAffinityCondition
	affinityOverall?: NPCAffinityOverallCondition
	attributes?: NPCAttributeCondition
	state?: NPCState
	active?: boolean
}

export interface InventoryCondition {
	has?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
}

export interface DialogueCondition {
	id: string
	nodeId: string
	playerId?: string // Optional, defaults to the current player
}

export interface Condition {
	flag?: FlagCondition
	quest?: QuestCondition
	npc?: NPCCondition
	time?: TimeRange
	date?: DateRange
	inventory?: InventoryCondition
	dialogue?: DialogueCondition
}

export interface FlagEffect {
	set?: string
	unset?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestEffect {
	start?: string
	progress?: string
}

export interface AffinityEffect {
	sentimentType: AffinitySentimentType
	set?: number
	add?: number
}

export interface FXEffect {
	type: FXType
	payload?: Record<string, any>
}

export interface CutsceneEffect {
	trigger: string
}

export interface EventEffect {
	type: string
	payload: Record<string, any>
}

export interface ChatEffect {
	message?: string
	system?: string
	fullscreen?: string
	emoji?: string
}

export interface NPCAttributeEffect {
	[attributeName: string]: {
		set?: any
		add?: number
		subtract?: number
		remove?: boolean
	}
}

export interface NPCEffect {
	id: string
	goTo?: Position | string | string[] // string for spot name, string[] for random selection from multiple spots
	message?: string
	emoji?: string
	affinity?: AffinityEffect
	attributes?: NPCAttributeEffect
	active?: boolean // can be used to enable/disable NPC
}

export interface ScheduleEffect {
	id: string            // ID of the scheduled event to target
	enabled: boolean      // Set to true to enable the event, false to disable
}

export interface InventoryEffect {
	add?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
	remove?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
}

export interface Effect {
	flag?: FlagEffect
	event?: EventEffect
	quest?: QuestEffect
	fx?: FXEffect
	cutscene?: CutsceneEffect
	chat?: ChatEffect
	npc?: NPCEffect
	schedule?: ScheduleEffect
	inventory?: InventoryEffect
}

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

export interface DialogueNode {
	speaker?: string
	text?: string
	options?: DialogueOption[]
	next?: string
	event?: DialogueEvent
	item?: DialogueItem
}

export interface DialogueOption {
	id: string
	text: string
	next?: string
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	item?: DialogueItem
}

export interface DialogueEvent {
	type: string
	payload: Record<string, any>
}

export interface DialogueItem {
	id?: string
	itemType: string
}

export interface DialogueTreePartial {
	id?: string
	npcId?: string
	nodes: Record<string, DialogueNode>
	startNode?: string
}

export interface DialogueTree extends DialogueTreePartial {
	id: string
	startNode?: string
	npcId: string
}

export interface DialogueTriggerData {
	dialogueId: string
	node: DialogueNode
	npcId: string
}

export interface DialogueContinueData {
	dialogueId: string
}

export interface DialogueChoiceData {
	dialogueId: string
	choiceId: string
}

export interface DialogueState {
	currentNodeId: string | null
	dialogueTreeId: string | null
}

export enum FXType {
	FadeToBlack = 'fadeToBlack',
	FadeFromBlack = 'fadeFromBlack',
	MoveCameraTo = 'moveCameraTo',
	ShakeScreen = 'shakeScreen',
	FocusOnNPC = 'focusOnNPC',
    DisplayUI = 'displayUI',
    EnableControls = 'enableControls',
}

export interface FXPlayEventData {
	type: FXType
	payload?: Record<string, any>
}

export enum FlagScope {
	Player = 'player',
	Map = 'map',
	Global = 'global'
}

export interface Flag {
	name: string
	value: any
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface SetFlagData {
	name: string
	value: any
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface UnsetFlagData {
	name: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface Position {
	row: number
	column: number
}

export interface InventorySlot {
	position: Position
	item: Item | null
}

export interface Inventory {
	slots: InventorySlot[]
}

export interface InventoryData extends PlayerSourcedData {
	inventory: Inventory
}

export interface DropItemData extends PlayerSourcedData {
	itemId: string
}

export interface PickUpItemData extends PlayerSourcedData {
	itemId: string
}

export interface ConsumeItemData extends PlayerSourcedData {
	itemId: string
}

export interface MoveItemData extends PlayerSourcedData {
	itemId: string
	sourcePosition: Position
	targetPosition: Position
}

export interface AddItemData {
	item: Item
	position: Position
}

export interface RemoveByTypePayload {
	itemType: string
	quantity?: number
}

export type ItemType = string

export enum ItemCategory {
	Tool = 'tool',
	Consumable = 'consumable',
	Material = 'material',
	Placeable = 'placeable',
	Quest = 'quest'
}

export interface Item {
	id: string
	itemType: ItemType
}

export interface ItemMetadata {
	id: ItemType
	name: string
    emoji: string
	description: string
	category: ItemCategory
	stackable: boolean
	maxStackSize?: number
	placement?: {
		size: {
			width: number
			height: number
		}
		blocksMovement: boolean
		blocksPlacement: boolean
	}
}

export interface ItemTypeRequest {
	itemType: ItemType
}

export interface ItemTypeResponse {
	itemType: ItemType
	meta: ItemMetadata | null
}

export interface DroppedItem extends Item {
	position: Position
	droppedAt: number
}

export type Range = {
	min: number
	max: number
}

export type SpawnPosition = {
	x: number | Range
	y: number | Range
}

export type LootSpawnPayload = {
	itemType: string
	position: SpawnPosition
	mapId: string
}

export type LootSpawnEventPayload = {
	item: DroppedItem
}

export type LootDespawnEventPayload = {
	itemId: string
}

export interface TiledMap {
	width: number
	height: number
	tilewidth: number
	tileheight: number
	layers: TiledLayer[]
}

export interface TiledLayer {
	id: number
	name: string
	type: 'tilelayer' | 'objectgroup'
	visible: boolean
	opacity: number
	x: number
	y: number
	data?: number[]
	objects?: TiledObject[]
	properties?: TiledProperty[]
}

export interface TiledObject {
	id: number
	name: string
	type: string
	visible: boolean
	x: number
	y: number
	width: number
	height: number
	properties?: TiledProperty[]
}

export interface TiledProperty {
	name: string
	type: string
	value: any
}

export interface CollisionData {
	width: number
	height: number
	data: number[]
}

export interface NPCSpot {
	position: Position
	properties: TiledProperty[]
}

export interface NPCSpots {
	[npcId: string]: {
		[spotName: string]: NPCSpot
	}
}

export interface MapTrigger {
	id: string
	position: Position
	width: number
	height: number
}

export interface MapData {
	id: string
	name: string
	tiledMap: TiledMap
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
}

export interface MapLayer {
	name: string
	data: number[]
	visible: boolean
	opacity: number
}

export interface MapObjectLayer {
	name: string
	objects: TiledObject[]
	visible: boolean
	opacity: number
}

export interface MapLoadData {
	mapId: string
}

export interface MapLoadResponseData {
	mapId: string
	name: string
	tileLayers: MapLayer[]
	objectLayers: MapObjectLayer[]
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
	mapUrl?: string
}

export interface MapTransitionData {
	toMapId: string
	position: Position
}

export interface MapTransitionResponseData {
	toMapId: string
	position: Position
	tileLayers: MapLayer[]
	objectLayers: MapObjectLayer[]
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
	mapUrl?: string
}

export interface PathData {
	width: number
	height: number
	data: number[]
}

/**
 * Interface for generating map URLs based on map names
 */
export interface MapUrlService {
	/**
	 * Generate a URL for a given map name
	 * @param mapName The name of the map
	 * @returns The complete URL to the map
	 */
	getMapUrl(mapName: string): string
}

export interface MapObject {
	id: string
	item: Item
	position: Position
	rotation: number
	playerId: string
	mapName: string
	metadata?: Record<string, any>
}

export interface PlaceObjectData {
	position: Position
	rotation?: number
	metadata?: Record<string, any>
	item: Item
}

export interface RemoveObjectData {
	objectId: string
}

export interface SpawnObjectData {
	object: MapObject
}

export interface DespawnObjectData {
	objectId: string
}

export enum NPCState {
	Idle = 'idle',
	Moving = 'moving'
}

export enum Direction {
	Down = 'down',
	Up = 'up',
	Left = 'left',
	Right = 'right'
}

export interface NPCAnimation {
	frames: number[] // Frame indices for animation
	frameRate: number
	repeat: number // -1 for infinite
}

export type DirectionalAnimations = {
	[key in Direction]?: NPCAnimation
}

export interface NPCAssets {
	avatar?: string // Path to the avatar image
	spritesheet: string // Path to the spritesheet containing all animation frames
	animations: {
		[idle: string]: DirectionalAnimations | NPCAnimation // Can be directional or single animation
	}
	frameWidth: number // Width of each frame in the spritesheet
	frameHeight: number // Height of each frame in the spritesheet
}

export interface NPCMessageCondition {
	check: () => boolean
	message: string
}

export interface NPCMessages {
	default: string
	conditions?: Array<{
		check: () => boolean
		message: string
	}>
}

export interface NPCRoutineStep {
	time: string // e.g. "08:00", "14:30"
	spot: string // Named spot or tile reference from map
	action?: string // Optional behavior
}

export interface NPCRoutine {
	steps: NPCRoutineStep[]
}

export interface NPC {
	id: string
	name: string
	position: Position
	mapId: string
	initialSpot?: string
	currentSpot?: string
	messages?: NPCMessages
	path?: Position[]
	speed: number
	routine?: NPCRoutine
	currentAction?: string
	attributes?: Record<string, any>
	state?: NPCState
	active?: boolean // defaults to true, if false NPC is disabled
	interactable?: boolean // defaults to false, if true NPC can be interacted with
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message?: string
	emoji?: string
}

export interface NPCGoData {
	npcId: string
	position?: Position
	spotName?: string
}

export interface NPCGoResponseData {
	npcId: string
	position: Position
}

export interface PlayerSourcedData {
	sourcePlayerId?: string
}

export const EquipmentSlot = {
	Hand: 'hand'
} as const

export type EquipmentSlotType = typeof EquipmentSlot[keyof typeof EquipmentSlot]

// Re-export the type as a value for runtime usage
export const EquipmentSlotType = EquipmentSlot

export interface EquipItemData extends PlayerSourcedData {
	itemId: string
	slotType: EquipmentSlotType
}

export interface UnequipItemData extends PlayerSourcedData {
	slotType: EquipmentSlotType
	targetPosition?: InventoryPosition
}

export interface Player {
	playerId: string
	position: WorldPosition
	mapId: string        // Changed from scene to mapId
	appearance?: any // TODO: Define appearance type
	equipment?: Record<EquipmentSlotType, Item | null> // Full item object or null for each slot
}

export interface PlayerJoinData extends PlayerSourcedData {
	position: WorldPosition
	mapId: string        // This is the primary property now
	appearance?: any
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: WorldPosition
	mapId: string        // Changed from scene to mapId
}

export interface PlayerMoveData extends PlayerSourcedData {
	x: number
	y: number
}

export interface PlayerAttackData extends PlayerSourcedData {
	position: WorldPosition
}

export interface PlayerPlaceData extends PlayerSourcedData {
	position: WorldPosition
	rotation?: number
	metadata?: Record<string, any>
}

export enum QuestScope {
	Player = 'player',
	Global = 'global',
	Shared = 'shared'
}

export interface QuestSettings {
	repeatable: boolean
	scope: QuestScope
}

export interface QuestStep {
	id: string
	label: string
	optional?: boolean
	npcId?: string // The NPC that needs to be talked to
	dialogue?: {
		id: string
		nodeId: string
	}
	condition?: Condition
	effect?: Effect
}

export interface QuestReward {
	exp?: number
	items?: Array<{
		id: string
		qty: number
	}>
}

export interface Quest {
	id: string
	chapter: number
	title: string
	description: string
	settings?: QuestSettings
	steps: QuestStep[]
	reward?: QuestReward
	startCondition?: Condition // Condition that must be met to start the quest
	startEffect?: Effect // Effect that is applied when the quest starts
}

export interface QuestProgress {
	questId: string
	currentStep: number
	completed: boolean
	completedSteps: string[]
}

export interface PlayerQuestState {
	activeQuests: QuestProgress[]
	completedQuests: string[]
}

export interface QuestStartRequest {
	questId: string
	playerId: string
}

export interface QuestUpdateResponse {
	questId: string
	progress: QuestProgress
}

export interface QuestListResponse {
	quests: QuestProgress[]
}

export interface QuestCompleteResponse {
	questId: string
	reward?: QuestReward
	summary?: string
}

export enum ScheduleType {
	Interval = 'interval',
	Cron = 'cron',
	Once = 'once',
	GameTime = 'game-time'
}

export type ScheduleOptions = {
	id?: string // Optional - will be auto-generated if not provided
	schedule: {
		type: ScheduleType
		value: string | number
		day?: number
		month?: number
		year?: number
	}
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	isActive?: boolean // Optional - defaults to true if not specified
}

export type ScheduledEvent = ScheduleOptions & {
	id: string // Make id required for ScheduledEvent
	lastRun?: Date
	nextRun?: Date
	isActive: boolean // Required in ScheduledEvent (will be set to true if not specified in options)
	createdAt: Time
}

export interface Time {
	hours: number
	minutes: number
	day: number
	month: number
	year: number
}

export interface TimeData {
	time: Time
	isPaused: boolean
	timeSpeed: number // real ms to ingame minute
}

export interface TimeUpdateEventData {
	time: Time
}

export interface TimeSpeedUpdateEventData {
	timeSpeed: number
}

export interface TimePauseEventData {
	isPaused: boolean
}

export interface TimeSyncEventData {
	time: Time
	isPaused: boolean
	timeSpeed: number
}

export const MONTHS_IN_YEAR = 12
export const DAYS_IN_MONTH = 30 // Simplified calendar with fixed month length

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

// Events
export const Event = {
  Affinity: {
    SC: {
      List: 'sc:affinity:list',
      Update: 'sc:affinity:update',
    },
    SS: {
      Update: 'ss:affinity:update',
      Updated: 'ss:affinity:updated',
    },
  },
  Chat: {
    CS: {
      Send: 'cs:chat:send',
    },
    SC: {
      Emoji: 'sc:chat:emoji',
      Fullscreen: 'sc:chat:fullscreen',
      Receive: 'sc:chat:receive',
      System: 'sc:chat:system',
    },
  },
  Cutscene: {
    SS: {
      Trigger: 'ss:cutscene:trigger',
    },
  },
  Dialogue: {
    CS: {
      Choice: 'cs:dialogue:choice',
      Continue: 'cs:dialogue:continue',
      End: 'cs:dialogue:end',
    },
    SC: {
      End: 'sc:dialogue:end',
      Trigger: 'sc:dialogue:trigger',
    },
  },
  FX: {
    SC: {
      Play: 'sc:fx:play',
    },
  },
  Flags: {
    SS: {
      FlagSet: 'ss:flags:flag_set',
      FlagUnset: 'ss:flags:flag_unset',
      SetFlag: 'ss:flags:set',
      UnsetFlag: 'ss:flags:unset',
    },
  },
  Inventory: {
    CS: {
      Consume: 'cs:inventory:consume',
      MoveItem: 'cs:inventory:move_item',
    },
    SC: {
      Add: 'sc:inventory:add',
      MoveItem: 'sc:inventory:move_item',
      Remove: 'sc:inventory:remove',
      Update: 'sc:inventory:update',
    },
    SS: {
      Add: 'ss:inventory:add',
      RemoveByType: 'ss:inventory:remove_by_type',
    },
  },
  Items: {
    CS: {
      GetType: 'cs:items:get_type',
    },
    SC: {
      Type: 'sc:items:type',
    },
  },
  Loot: {
    SC: {
      Despawn: 'sc:loot:despawn',
      Spawn: 'sc:loot:spawn',
    },
    SS: {
      Spawn: 'ss:loot:spawn',
    },
  },
  Map: {
    CS: {
      Load: 'cs:map:load',
      Transition: 'cs:map:transition',
    },
    SC: {
      Load: 'sc:map:load',
      Transition: 'sc:map:transition',
    },
  },
  MapObjects: {
    CS: {
      Place: 'cs:mapobj:place',
      Remove: 'cs:mapobj:remove',
    },
    SC: {
      Despawn: 'sc:mapobj:despawn',
      Spawn: 'sc:mapobj:spawn',
    },
  },
  NPC: {
    CS: {
      Interact: 'cs:npc:interact',
    },
    SC: {
      Action: 'sc:npc:action',
      Despawn: 'sc:npc:despawn',
      Go: 'sc:npc:go',
      List: 'sc:npc:list',
      Message: 'sc:npc:message',
      Spawn: 'sc:npc:spawn',
    },
    SS: {
      Go: 'ss:npc:go',
      RemoveAttribute: 'ss:npc:remove_attribute',
      SetAttribute: 'ss:npc:set_attribute',
    },
  },
  Players: {
    CS: {
      Connect: 'cs:players:connect',
      DropItem: 'cs:players:drop_item',
      Equip: 'cs:players:equip',
      Join: 'cs:players:join',
      Move: 'cs:players:move',
      PickupItem: 'cs:players:pickup_item',
      Place: 'cs:players:place',
      TransitionTo: 'cs:players:transition-to',
      Unequip: 'cs:players:unequip',
    },
    SC: {
      Connected: 'sc:players:connected',
      Equip: 'sc:players:equip',
      Joined: 'sc:players:joined',
      Left: 'sc:players:left',
      Move: 'sc:players:move',
      Unequip: 'sc:players:unequip',
    },
  },
  Quest: {
    SC: {
      Complete: 'sc:quest:complete',
      List: 'sc:quest:list',
      Start: 'sc:quest:start',
      StepComplete: 'sc:quest:step_complete',
      Update: 'sc:quest:update',
    },
    SS: {
      Start: 'ss:quest:start',
    },
  },
  Scheduler: {
    SS: {
      Cancel: 'ss:scheduler:cancel',
      Cancelled: 'ss:scheduler:cancelled',
      Disable: 'ss:scheduler:disable',
      Enable: 'ss:scheduler:enable',
      Schedule: 'ss:scheduler:schedule',
      Scheduled: 'ss:scheduler:scheduled',
      Triggered: 'ss:scheduler:triggered',
    },
  },
  System: {
    CS: {
      Ping: 'cs:system:ping',
    },
    SC: {
      Ping: 'sc:system:ping',
    },
  },
  Time: {
    SC: {
      Paused: 'time:sc:paused',
      Resumed: 'time:sc:resumed',
      SpeedSet: 'time:sc:speed-set',
      Sync: 'time:sc:sync',
      TimeSet: 'time:sc:time-set',
      Updated: 'time:sc:updated',
    },
    SS: {
      Pause: 'time:ss:pause',
      Resume: 'time:ss:resume',
      SetSpeed: 'time:ss:set-speed',
      Update: 'time:ss:update',
    },
  },
  Triggers: {
    CS: {
      Trigger: 'cs:triggers:trigger',
    },
    SC: {
      Triggered: 'sc:triggers:triggered',
    },
  },
}
