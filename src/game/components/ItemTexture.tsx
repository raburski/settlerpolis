import React, { useEffect, useState } from 'react'
import { itemTextureService } from '../services/ItemTextureService'
import styles from './ItemTexture.module.css'

interface ItemTextureProps {
	itemType: string
	className?: string
	style?: React.CSSProperties
	fallbackEmoji?: string
	draggable?: boolean
	onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
	onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
}

/**
 * A React component that renders an item texture based on the item type.
 * Uses the ItemTextureService to get the texture information.
 */
export const ItemTexture: React.FC<ItemTextureProps> = ({ 
	itemType, 
	className = '', 
	style = {},
	fallbackEmoji = '📦',
	draggable = false,
	onDragStart,
	onDragEnd
}) => {
	const [textureInfo, setTextureInfo] = useState<{ key: string, frame: number } | undefined>(undefined)
	const [textureConfig, setTextureConfig] = useState<{ path: string, frameWidth: number, frameHeight: number, frameCount: number } | undefined>(undefined)
	const [error, setError] = useState<boolean>(false)

	useEffect(() => {
		// Get the texture info from the service
		const info = itemTextureService.getItemTexture(itemType)
		setTextureInfo(info)

		if (info) {
			// If we have texture info, get the texture configuration
			const config = itemTextureService.getTextureConfig(itemType)
			
			if (config) {
				// Preload the image
				const img = new Image()
				img.src = config.path
				img.onload = () => {
					setTextureConfig({
						path: config.path,
						frameWidth: config.frameWidth,
						frameHeight: config.frameHeight,
						frameCount: config.frameCount
					})
				}
				img.onerror = () => {
					setError(true)
				}
			} else {
				setError(true)
			}
		} else {
			setError(true)
		}
	}, [itemType])

	// If we have an error or no texture info, show the fallback emoji
	if (error || !textureInfo || !textureConfig) {
		return (
			<div 
				className={`${styles.itemTexture} ${styles.fallback} ${className}`} 
				style={style}
				draggable={draggable}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
			>
				{fallbackEmoji}
			</div>
		)
	}

	// Calculate the number of columns per row based on the frame count
	// Assuming a square grid, the number of columns is the square root of the frame count
	const columnsPerRow = Math.ceil(Math.sqrt(textureConfig.frameCount))
	const row = Math.floor(textureInfo.frame / columnsPerRow)
	const col = textureInfo.frame % columnsPerRow
	
	// Calculate the background position to show the correct frame
	const bgPositionX = -col * textureConfig.frameWidth
	const bgPositionY = -row * textureConfig.frameHeight

	// Create the background style for the sprite sheet
	const bgStyle: React.CSSProperties = {
		...style,
		backgroundImage: `url(${textureConfig.path})`,
		backgroundPosition: `${bgPositionX}px ${bgPositionY}px`,
		backgroundSize: 'auto',
		minWidth: '64px',
		minHeight: '64px',
		width: '64px',
		height: '64px',
		backgroundRepeat: 'no-repeat',
		flexShrink: 0, // Prevent flexbox from shrinking the element
		transform: 'scale(0.5)', // Scale down from 64x64 to 32x32
	}

	// Show the sprite sheet with the correct frame
	return (
		<div 
			className={`${styles.itemTexture} ${className}`} 
			style={bgStyle}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		/>
	)
} 