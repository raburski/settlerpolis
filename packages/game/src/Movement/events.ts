export const MovementEvents = {
	SS: {
		MoveToPosition: 'ss:movement:move-to-position',
		CancelMovement: 'ss:movement:cancel',
		StepComplete: 'ss:movement:step-complete',
		PathComplete: 'ss:movement:path-complete' // Path completed, optionally includes targetType/targetId if target exists
	},
	SC: {
		MoveToPosition: 'sc:movement:move-to-position', // Order entity to move to position (interpolated movement)
		PositionUpdated: 'sc:movement:position-updated' // Entity position changed (teleport/sync, no interpolation)
	}
} as const
