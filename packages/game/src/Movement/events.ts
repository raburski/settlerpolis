export const MovementEvents = {
	SS: {
		MoveToPosition: 'ss:movement:move-to-position',
		CancelMovement: 'ss:movement:cancel',
		StepComplete: 'ss:movement:step-complete',
		SegmentComplete: 'ss:movement:segment-complete',
		PathComplete: 'ss:movement:path-complete', // Path completed, optionally includes targetType/targetId if target exists
		YieldRequested: 'ss:movement:yield-requested' // Request an idle blocker to step aside from a congested tile
	},
	SC: {
		MoveToPosition: 'sc:movement:move-to-position', // Order entity to move to position (interpolated movement)
		PositionUpdated: 'sc:movement:position-updated', // Entity position changed (teleport/sync, no interpolation)
		Paused: 'sc:movement:paused' // Entity movement paused due to congestion
	}
} as const
