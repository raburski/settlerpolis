export const InventoryEvents = {
	CS: {
		Consume: 'cs:inventory:consume'
	},
	SC: {
		Update: 'sc:inventory:update',
		Add: 'sc:inventory:add',
		Remove: 'sc:inventory:remove'
	},
	SS: {
		Add: 'ss:inventory:add'
	}
} as const 