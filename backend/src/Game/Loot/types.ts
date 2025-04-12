import { Position } from '../../types'
import { Item } from '../Items/types'

export interface DroppedItem extends Item {
	position: Position
	droppedAt: number
} 