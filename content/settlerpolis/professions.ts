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
		canWorkBuildings: ['woodcutter_hut', 'charcoal_kiln'] // Can work in woodcutter hut (Phase C)
	},
	{
		type: ProfessionType.Miner,
		name: 'Miner',
		description: 'A settler skilled in mining',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['quarry', 'coal_mine', 'iron_mine', 'gold_mine']
	},
	{
		type: ProfessionType.Metallurgist,
		name: 'Metallurgist',
		description: 'A settler skilled in smelting ores',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['iron_smelter', 'gold_smelter', 'mint', 'armory', 'blacksmith']
	},
	{
		type: ProfessionType.Farmer,
		name: 'Farmer',
		description: 'A settler skilled in farming',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['farm']
	},
	{
		type: ProfessionType.Fisher,
		name: 'Fisher',
		description: 'A settler skilled in fishing',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['fishers_hut']
	},
	{
		type: ProfessionType.Miller,
		name: 'Miller',
		description: 'A settler skilled in milling grain',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['windmill']
	},
	{
		type: ProfessionType.Baker,
		name: 'Baker',
		description: 'A settler skilled in baking bread',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['bakery']
	},
	{
		type: ProfessionType.Vendor,
		name: 'Vendor',
		description: 'A settler who distributes market goods',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['market']
	},
	{
		type: ProfessionType.Hunter,
		name: 'Hunter',
		description: 'A settler skilled in tracking wildlife',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['hunter_cabin']
	}
]
