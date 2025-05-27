export const InventoryEvents = {
	CS: {
		Consume: 'cs:inventory:consume',
		MoveItem: 'cs:inventory:move_item'
	},
	SC: {
		Update: 'sc:inventory:update',
		Add: 'sc:inventory:add',
		Remove: 'sc:inventory:remove',
		MoveItem: 'sc:inventory:move_item'
	},
	SS: {
		Add: 'ss:inventory:add',
		RemoveByType: 'ss:inventory:remove_by_type'
	}
} as const

export interface RemoveByTypePayload {
	itemType: string
	quantity?: number
} 