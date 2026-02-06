import type { ItemType } from '../Items/types'

export enum WorldMapNodeType {
	Home = 'home',
	City = 'city',
	Expedition = 'expedition'
}

export type WorldMapNodeTradeOffer = {
	id: string
	offerItem: ItemType
	offerQuantity: number
	receiveItem: ItemType
	receiveQuantity: number
	reputation: number
	cooldownSeconds?: number
}

export type WorldMapNode = {
	id: string
	label: string
	type: WorldMapNodeType
	position: { x: number; y: number }
	description: string
	tradeOffers?: WorldMapNodeTradeOffer[]
}

export type WorldMapLinkType = 'land' | 'sea'

export type WorldMapLink = {
	fromId: string
	toId: string
	type: WorldMapLinkType
	distance?: number
}

export type WorldMapData = {
	image: string
	travelSecondsPerUnit: number
	nodes: WorldMapNode[]
	links: WorldMapLink[]
	homeNodeId: string
}
