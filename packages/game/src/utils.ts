import { Direction, DirectionalAnimations, NPCAnimation } from './types'

/**
 * Checks if the given direction is horizontal (left or right)
 */
export function isHorizontalDirection(direction: Direction): boolean {
	return direction === Direction.Left || direction === Direction.Right
}

/**
 * Returns the mirrored direction (e.g. Left -> Right, Up -> Down)
 */
export function getMirroredDirection(direction: Direction): Direction {
	switch (direction) {
		case Direction.Down: return Direction.Up
		case Direction.Left: return Direction.Right
		case Direction.Right: return Direction.Left
		case Direction.Up: return Direction.Down
	}
}

/**
 * Type guard to check if animation is directional
 */
export function isDirectionalAnimation(animation: DirectionalAnimations | NPCAnimation | undefined): animation is DirectionalAnimations {
	if (!animation) return false
	return 'down' in animation || 'up' in animation || 'left' in animation || 'right' in animation
} 