import { CityCharterContent } from '@rugged/game'

export const cityCharters: CityCharterContent = {
	defaultTierId: 'camp',
	tiers: [
		{
			id: 'camp',
			level: 0,
			name: 'Camp',
			requirements: {
				population: 0
			},
			unlockFlags: [],
			buffs: []
		},
		{
			id: 'hamlet',
			level: 1,
			name: 'Hamlet',
			requirements: {
				population: 6
			},
			unlockFlags: ['charter:hamlet'],
			buffs: []
		},
		{
			id: 'village',
			level: 2,
			name: 'Village',
			requirements: {
				population: 12
			},
			unlockFlags: ['charter:village'],
			buffs: []
		}
	]
}
