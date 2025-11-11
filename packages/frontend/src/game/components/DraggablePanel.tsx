import React, { useState, useRef, useEffect, ReactNode } from 'react'
import styles from './DraggablePanel.module.css'

interface DraggablePanelProps {
	icon: string
	title: string
	onClose: () => void
	children: ReactNode
	initialPosition?: { x: number; y: number }
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
	icon,
	title,
	onClose,
	children,
	initialPosition
}) => {
	const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
		if (initialPosition) {
			return initialPosition
		}
		return null // Will use CSS transform for centering
	})
	const [isDragging, setIsDragging] = useState(false)
	const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
	const panelRef = useRef<HTMLDivElement>(null)
	const hasBeenDragged = useRef(false)

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isDragging && panelRef.current) {
				// Ensure we have a position set (should be set by handleMouseDown)
				if (position === null) {
					const rect = panelRef.current.getBoundingClientRect()
					setPosition({
						x: rect.left,
						y: rect.top
					})
					return
				}
				
				const newX = e.clientX - dragOffset.x
				const newY = e.clientY - dragOffset.y
				
				// Constrain to viewport
				const panelWidth = panelRef.current.offsetWidth
				const panelHeight = panelRef.current.offsetHeight
				
				const constrainedX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth))
				const constrainedY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight))
				
				setPosition({
					x: constrainedX,
					y: constrainedY
				})
			}
		}

		const handleMouseUp = () => {
			setIsDragging(false)
		}

		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [isDragging, dragOffset, position])

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (panelRef.current) {
			const rect = panelRef.current.getBoundingClientRect()
			
			// If this is the first drag and we're using transform centering, calculate actual position
			if (!hasBeenDragged.current && position === null) {
				const centerX = window.innerWidth / 2
				const centerY = window.innerHeight / 2
				const actualX = centerX - rect.width / 2
				const actualY = centerY - rect.height / 2
				setPosition({
					x: actualX,
					y: actualY
				})
			}
			
			setDragOffset({
				x: e.clientX - rect.left,
				y: e.clientY - rect.top
			})
			setIsDragging(true)
			hasBeenDragged.current = true
			e.preventDefault() // Prevent text selection while dragging
		}
	}

	const panelStyle: React.CSSProperties = position === null
		? {
				top: '50%',
				left: '50%',
				transform: 'translate(-50%, -50%)'
		  }
		: {
				left: `${position.x}px`,
				top: `${position.y}px`,
				transform: 'none'
		  }

	return (
		<div
			ref={panelRef}
			className={styles.panel}
			style={panelStyle}
		>
			<div
				className={styles.header}
				onMouseDown={handleMouseDown}
				style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
			>
				<div className={styles.title}>
					<span className={styles.icon}>{icon}</span>
					<h3>{title}</h3>
				</div>
				<button 
					className={styles.closeButton} 
					onClick={onClose}
					onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking close button
				>
					×
				</button>
			</div>
			<div className={styles.content}>
				{children}
			</div>
		</div>
	)
}

