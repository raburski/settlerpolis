import { AffinitySentimentType } from '../types'

export const NPCSentimentWeights: Record<string, Partial<Record<AffinitySentimentType, number>>> = {
	innkeeper: {
		[AffinitySentimentType.Empathy]: 2,
		[AffinitySentimentType.Trust]: 1.5,
		[AffinitySentimentType.Curiosity]: 1,
		[AffinitySentimentType.Devotion]: 0.5
	}
} 