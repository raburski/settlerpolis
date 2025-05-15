import { Scene, GameObjects } from 'phaser'

/**
 * Options for displaying a message
 */
export interface MessageDisplayOptions {
	/** The message text to display */
	message: string
	/** The scene to add the message to */
	scene: Scene
	/** The container to add the message to */
	container: GameObjects.Container
	/** The vertical offset from the container's position */
	yOffset?: number
	/** The font size in pixels */
	fontSize?: string
	/** The text color */
	color?: string
	/** The background color */
	backgroundColor?: string
	/** The padding around the text */
	padding?: { x: number, y: number }
	/** The time in milliseconds before the message is automatically removed */
	duration?: number
	/** The existing message text to replace, if any */
	existingText?: GameObjects.Text | null
}

/**
 * Displays a message above a game object
 * @param options The message display options
 * @returns The created text object
 */
export function displayMessage(options: MessageDisplayOptions): GameObjects.Text {
	const {
		message,
		scene,
		container,
		yOffset = -50,
		fontSize = '14px',
		color = '#ffffff',
		backgroundColor = '#000000',
		padding = { x: 4, y: 4 },
		duration = 3000,
		existingText
	} = options

	// Remove existing message if any
	if (existingText) {
		existingText.destroy()
	}

	// Create new message text
	const text = scene.add.text(0, yOffset, message, {
		fontSize,
		color,
		backgroundColor,
		padding,
		align: 'center'
	})
	
	// Center the text horizontally
	text.setOrigin(0.5, 0.5)
	
	// Set a very high depth to ensure text is always on top
	text.setDepth(9999)
	
	// Add to container
	container.add(text)
	
	// Auto-remove after the specified duration
	scene.time.delayedCall(duration, () => {
		if (text && text.active) {
			text.destroy()
		}
	})

	return text
}

/**
 * Displays a system message above a game object
 * @param options The message display options
 * @returns The created text object
 */
export function displaySystemMessage(options: MessageDisplayOptions): GameObjects.Text | null {
	const {
		message,
		scene,
		container,
		yOffset = -70,
		fontSize = '14px',
		color = '#FF0000',
		backgroundColor = '#000000',
		padding = { x: 4, y: 4 },
		duration = 5000,
		existingText
	} = options

	// If message is null, just return
	if (!message) {
		return null
	}

	// Remove existing message if any
	if (existingText) {
		existingText.destroy()
	}

	// Create new system message text
	const text = scene.add.text(0, yOffset, message, {
		fontSize,
		color,
		backgroundColor,
		padding,
		align: 'center'
	})
	
	// Center the text horizontally
	text.setOrigin(0.5, 0.5)
	
	// Set a very high depth to ensure text is always on top
	text.setDepth(1009999)
	
	// Add to container
	container.add(text)
	
	// Auto-remove after the specified duration
	scene.time.delayedCall(duration, () => {
		if (text && text.active) {
			text.destroy()
		}
	})

	return text
}

/**
 * Displays an emoji above a game object
 * @param options The message display options
 * @returns The created text object
 */
export function displayEmoji(options: MessageDisplayOptions): GameObjects.Text {
	const {
		message,
		scene,
		container,
		yOffset = -50,
		fontSize = '26px',
		color = '#ffffff',
		backgroundColor = 'transparent',
		padding = { x: 0, y: 0 },
		duration = 2000,
		existingText
	} = options

	// Remove existing message if any
	if (existingText) {
		existingText.destroy()
	}

	// Create new message text
	const text = scene.add.text(0, yOffset, message, {
		fontSize,
		color,
		backgroundColor,
		padding,
		align: 'center'
	})
	
	// Center the text horizontally
	text.setOrigin(0.5, 0.5)
	
	// Set a very high depth to ensure text is always on top
	text.setDepth(1009999)
	
	// Add to container
	container.add(text)
	
	// Auto-remove after the specified duration
	scene.time.delayedCall(duration, () => {
		if (text && text.active) {
			text.destroy()
		}
	})

	return text
} 