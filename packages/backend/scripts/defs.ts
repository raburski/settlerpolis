/**
 * Auto-generated types and events definitions
 * Generated on: 2025-04-25T10:24:01.306Z
 */

/**
 * Content folder structure:
general/
  cutscenes/
    index.ts
  flags/
    index.ts
  index.ts
  items/
    index.ts
  maps/
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
types.ts

 */

// Types
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
	canStart: string
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

export interface NPCCondition {
	proximity?: number
	id: string
	affinity?: NPCAffinityCondition
	affinityOverall?: NPCAffinityOverallCondition
}

export interface Condition {
	flag?: FlagCondition
	quest?: QuestCondition
	npc?: NPCCondition
	time?: TimeRange
	date?: DateRange
}

export interface FlagEffect {
	set?: string
	unset?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestEffect {
	start: string
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

export interface NPCEffect {
	id: string
	goTo?: Position | string // string for spot name
	message?: string
	emoji?: string
	affinity?: AffinityEffect
}

export interface Effect {
	flag?: FlagEffect
	event?: EventEffect
	quest?: QuestEffect
	fx?: FXEffect
	cutscene?: CutsceneEffect
	chat?: ChatEffect
	npc?: NPCEffect
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

export type ItemType = string

export enum ItemCategory {
	Tool = 'tool',
	Consumable = 'consumable',
	Material = 'material',
	Placeable = 'placeable'
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
	scene: string
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

export interface MapTransitionData {
	fromMapId: string
	toMapId: string
	position: Position
}

export interface PathData {
	width: number
	height: number
	data: number[]
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
	scene: string
	messages?: NPCMessages
	path?: Position[]
	speed: number
	routine?: NPCRoutine
	currentAction?: string
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message: string
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

export enum EquipmentSlotType {
	Hand = 'hand'
}

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
	scene: string
	appearance?: any // TODO: Define appearance type
	equipment?: Record<EquipmentSlotType, Item | null> // Full item object or null for each slot
}

export interface PlayerJoinData extends PlayerSourcedData {
	position: WorldPosition
	scene: string
	appearance?: any
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: WorldPosition
	scene: string
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
	completeWhen: {
		event: string
		inventory?: {
			itemType: string
			quantity: number
		}
		condition?: Record<string, any>
		payload?: Record<string, any>
	}
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

export type ScheduledEvent = {
	id: string
	eventType: string
	payload: any
	schedule: {
		type: ScheduleType
		value: string | number // Interval in ms, cron expression, timestamp, or game time string (HH:MM)
		day?: number // Optional day of month for game-time
		month?: number // Optional month for game-time
		year?: number // Optional year for game-time
	}
	lastRun?: Date
	nextRun?: Date
	isActive: boolean
	createdAt: Time
}
export type ScheduleOptions = {
	id?: string // Optional - will be auto-generated if not provided
	eventType: string
	payload: any
	schedule: {
		type: ScheduleType
		value: string | number
		day?: number
		month?: number
		year?: number
	}
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

export interface TriggerNPCProximity {
	npcId: string
	proximityRadius: number
}

export interface Trigger {
	id: string
	option: TriggerOption
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
}

export interface NPCContent extends NPC {
    sentiments?: AffinitySentiments
    dialogues?: DialogueTreePartial[]
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
      Go: 'sc:npc:go',
      List: 'sc:npc:list',
      Message: 'sc:npc:message',
    },
    SS: {
      Go: 'ss:npc:go',
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
