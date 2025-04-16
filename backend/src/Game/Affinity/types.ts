export enum AffinitySentimentType {
	Empathy = 'empathy',
	Curiosity = 'curiosity',
	Trust = 'trust',
	Devotion = 'devotion'
}

// Define the structure for affinity data
export interface AffinityData {
	playerId: string
	npcId: string
	sentiments: Record<AffinitySentimentType, number>
	lastUpdated: number
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