import { AffinitySentimentType, AffinityValueRange } from './types'

// Default values for each sentiment type when a player first interacts with an NPC
export const DEFAULT_SENTIMENT_VALUES: Record<AffinitySentimentType, number> = {
	[AffinitySentimentType.Empathy]: 0,
	[AffinitySentimentType.Curiosity]: 0,
	[AffinitySentimentType.Trust]: 0,
	[AffinitySentimentType.Devotion]: 0
}

// Define the ranges for each sentiment value
export const SENTIMENT_VALUE_RANGES: Record<AffinityValueRange, { min: number; max: number }> = {
	[AffinityValueRange.VeryNegative]: { min: -100, max: -75 },
	[AffinityValueRange.Negative]: { min: -74, max: -25 },
	[AffinityValueRange.Neutral]: { min: -24, max: 25 },
	[AffinityValueRange.Positive]: { min: 26, max: 75 },
	[AffinityValueRange.VeryPositive]: { min: 76, max: 100 }
}

// Define human-readable descriptions for each sentiment type and range
export const SENTIMENT_VALUE_DESCRIPTIONS: Record<AffinitySentimentType, Record<AffinityValueRange, string>> = {
	[AffinitySentimentType.Empathy]: {
		[AffinityValueRange.VeryNegative]: 'Hostile',
		[AffinityValueRange.Negative]: 'Unfriendly',
		[AffinityValueRange.Neutral]: 'Neutral',
		[AffinityValueRange.Positive]: 'Friendly',
		[AffinityValueRange.VeryPositive]: 'Close'
	},
	[AffinitySentimentType.Curiosity]: {
		[AffinityValueRange.VeryNegative]: 'Disinterested',
		[AffinityValueRange.Negative]: 'Skeptical',
		[AffinityValueRange.Neutral]: 'Cautious',
		[AffinityValueRange.Positive]: 'Interested',
		[AffinityValueRange.VeryPositive]: 'Fascinated'
	},
	[AffinitySentimentType.Trust]: {
		[AffinityValueRange.VeryNegative]: 'Distrustful',
		[AffinityValueRange.Negative]: 'Suspicious',
		[AffinityValueRange.Neutral]: 'Reserved',
		[AffinityValueRange.Positive]: 'Trusting',
		[AffinityValueRange.VeryPositive]: 'Loyal'
	},
	[AffinitySentimentType.Devotion]: {
		[AffinityValueRange.VeryNegative]: 'Opposed',
		[AffinityValueRange.Negative]: 'Unsupportive',
		[AffinityValueRange.Neutral]: 'Indifferent',
		[AffinityValueRange.Positive]: 'Supportive',
		[AffinityValueRange.VeryPositive]: 'Dedicated'
	}
} 