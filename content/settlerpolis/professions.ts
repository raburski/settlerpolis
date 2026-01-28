import { ProfessionDefinition, ProfessionType } from '@rugged/game'

export const professions: ProfessionDefinition[] = [
	{
		type: ProfessionType.Carrier,
		name: 'Carrier',
		description: 'A basic settler that can carry goods',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: []
	},
	{
		type: ProfessionType.Builder,
		name: 'Builder',
		description: 'A settler skilled in construction',
		canBuild: true,
		canCarry: true,
		canWorkBuildings: [] // Phase B: No production buildings yet
	},
	{
		type: ProfessionType.Woodcutter,
		name: 'Woodcutter',
		description: 'A settler skilled in cutting wood',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['woodcutter_hut'] // Can work in woodcutter hut (Phase C)
	},
	{
		type: ProfessionType.Miner,
		name: 'Miner',
		description: 'A settler skilled in mining',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: [] // Phase B: No mining buildings yet
	}
]

