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