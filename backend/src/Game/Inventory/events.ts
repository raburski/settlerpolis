export const InventoryEvents = {
	CS: {
		Drop: 'cs:inventory:drop',
		PickUp: 'cs:inventory:pickup',
		Consume: 'cs:inventory:consume'
	},
	SC: {
		Loaded: 'sc:inventory:loaded'
	}
} as const 