import type { PlayerId } from '../ids'

export type ReputationUpdatedData = {
	playerId: PlayerId
	reputation: number
}

export type ReputationSnapshot = {
	reputation: Array<[PlayerId, number]>
}
