import { AffinitySentimentType, AffinityValueRange, OverallNPCApproach } from './types'
import { SENTIMENT_VALUE_RANGES, SENTIMENT_VALUE_DESCRIPTIONS } from './consts'

// Helper function to get the range for a sentiment value
export function getSentimentValueRange(value: number): AffinityValueRange {
	// Round up to the nearest range boundary if needed
	if (value <= SENTIMENT_VALUE_RANGES[AffinityValueRange.VeryNegative].max) return AffinityValueRange.VeryNegative
	if (value <= SENTIMENT_VALUE_RANGES[AffinityValueRange.Negative].max) return AffinityValueRange.Negative
	if (value <= SENTIMENT_VALUE_RANGES[AffinityValueRange.Neutral].max) return AffinityValueRange.Neutral
	if (value <= SENTIMENT_VALUE_RANGES[AffinityValueRange.Positive].max) return AffinityValueRange.Positive
	return AffinityValueRange.VeryPositive
}

// Helper function to get the description for a sentiment value
export function getSentimentDescription(sentimentType: AffinitySentimentType, value: number): string {
	const range = getSentimentValueRange(value)
	return SENTIMENT_VALUE_DESCRIPTIONS[sentimentType][range]
}

export function getOverallNPCApproach(sentiments: Record<AffinitySentimentType, number>): OverallNPCApproach {
	// Calculate average sentiment
	const values = Object.values(sentiments)
	const average = values.reduce((sum, value) => sum + value, 0) / values.length

	// Check for special cases based on sentiment combinations
	const empathy = sentiments[AffinitySentimentType.Empathy]
	const curiosity = sentiments[AffinitySentimentType.Curiosity]
	const trust = sentiments[AffinitySentimentType.Trust]
	const devotion = sentiments[AffinitySentimentType.Devotion]

	// Complex relationships
	if (empathy > 75 && trust < -25) return OverallNPCApproach.Ambivalent
	if (curiosity > 75 && trust < -25) return OverallNPCApproach.Obsessed
	if (empathy < -25 && curiosity > 75) return OverallNPCApproach.Competitive

	// Transactional relationships
	if (trust > 25 && devotion > 25 && empathy < 25) return OverallNPCApproach.Businesslike
	if (trust > 50 && devotion > 50) return OverallNPCApproach.Contracting
	if (trust > 75 && devotion > 75) return OverallNPCApproach.Working
	if (trust > 90 && devotion > 90) return OverallNPCApproach.Employing

	// Social relationships
	if (empathy > 90 && trust > 90) return OverallNPCApproach.Intimate
	if (empathy > 75 && trust > 75) return OverallNPCApproach.Friendly
	if (empathy > 50 && trust > 50) return OverallNPCApproach.Acquainted
	if (empathy < 25 && trust < 25) return OverallNPCApproach.Indifferent

	// Trust-based relationships
	if (trust > 90 && curiosity > 75) return OverallNPCApproach.Trusting
	if (trust > 75 && devotion > 50) return OverallNPCApproach.Mentoring
	if (trust > 50 && curiosity > 75) return OverallNPCApproach.Learning
	if (trust > 75 && empathy > 75) return OverallNPCApproach.Protecting

	// Commitment-based relationships
	if (devotion > 90 && trust > 90) return OverallNPCApproach.Devoting
	if (devotion > 75 && trust > 75) return OverallNPCApproach.Fighting
	if (devotion > 50 && trust > 50) return OverallNPCApproach.Supporting
	if (devotion > 25 && trust > 25) return OverallNPCApproach.Following

	// Hostile relationships
	if (empathy < -90 && trust < -90) return OverallNPCApproach.Hateful
	if (empathy < -75 && trust < -75) return OverallNPCApproach.Vengeful
	if (empathy < -50 && trust < -50) return OverallNPCApproach.Antagonistic

	// Basic approaches based on average sentiment
	if (average <= -75) return OverallNPCApproach.Enemy
	if (average <= -25) return OverallNPCApproach.Rival
	if (average <= 25) return OverallNPCApproach.Stranger
	if (average <= 75) return OverallNPCApproach.Acquaintance
	if (average <= 90) return OverallNPCApproach.Friend
	return OverallNPCApproach.Ally
} 