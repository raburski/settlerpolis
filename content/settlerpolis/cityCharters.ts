import { CityCharterContent } from '@rugged/game'

export const cityCharters: CityCharterContent = {
	defaultTierId: 'settlement',
	tiers: [
		{
			id: 'settlement',
			level: 1,
			name: 'Settlement',
			requirements: {
				population: 0
			},
			unlockFlags: ['charter:settlement'],
			buffs: []
		},
		{
			id: 'market-town',
			level: 2,
			name: 'Market Town',
			requirements: {
				population: 6
			},
			unlockFlags: ['charter:market-town'],
			buffs: []
		},
		{
			id: 'chartered-city',
			level: 3,
			name: 'Chartered City',
			requirements: {
				population: 12
			},
			unlockFlags: ['charter:chartered-city'],
			buffs: []
		},
		{
			id: 'free-city',
			level: 4,
			name: 'Free City',
			requirements: {
				population: 18
			},
			unlockFlags: ['charter:free-city'],
			buffs: []
		},
		{
			id: 'trade-hub',
			level: 5,
			name: 'Trade Hub',
			requirements: {
				population: 24
			},
			unlockFlags: ['charter:trade-hub'],
			buffs: []
		},
		{
			id: 'metropolitan-seat',
			level: 6,
			name: 'Metropolitan Seat',
			requirements: {
				population: 30
			},
			unlockFlags: ['charter:metropolitan-seat'],
			buffs: []
		}
	]
}
