export enum ChatMessageType {
	Local = 'local',
	System = 'system'
}

export interface ChatMessageData {
	message: string
	type: ChatMessageType
	playerId?: string
}

export interface ChatSystemMessageData {
	message: string
	type: 'warning' | 'info' | 'success' | 'error'
} 