import { GameObjects } from 'phaser'

export interface PlayerView extends GameObjects.GameObject {
	/**
	 * Displays a message above the player
	 */
	displayMessage(message: string): void
	
	/**
	 * Displays an emoji above the player
	 */
	displayEmoji(emoji: string): void
	
	/**
	 * Displays a system message above the player
	 */
	displaySystemMessage(message: string | null): void
	
	/**
	 * Sets the target position for movement
	 */
	setTargetPosition(x: number, y: number): void
	
	/**
	 * Pre-update function for movement
	 */
	preUpdate(): void
} 