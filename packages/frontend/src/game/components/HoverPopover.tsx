import React from 'react'
import styles from './HoverPopover.module.css'

interface HoverPopoverProps {
	content: React.ReactNode
	children: React.ReactNode
	className?: string
}

export const HoverPopover: React.FC<HoverPopoverProps> = ({ content, children, className }) => {
	const rootClassName = className ? `${styles.root} ${className}` : styles.root

	return (
		<span className={rootClassName} tabIndex={0}>
			<span className={styles.trigger}>{children}</span>
			<span className={styles.popover} role="tooltip">
				{content}
			</span>
		</span>
	)
}
