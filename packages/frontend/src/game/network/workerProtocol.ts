import type { GameContent } from '@rugged/game'
import type { GameSnapshotV1, Receiver } from '@rugged/game'

export type WorkerEventDirection = 'client' | 'server'

export type WorkerInitMessage = {
	type: 'init'
	content: GameContent
	mapBaseUrl: string
	logAllowlist?: string[]
	simulationTickMs?: number
	silentLogs?: boolean
	debug?: boolean
}

export type WorkerReadyMessage = {
	type: 'ready'
}

export type WorkerConnectMessage = {
	type: 'connect'
}

export type WorkerDisconnectMessage = {
	type: 'disconnect'
}

export type WorkerEventMessage = {
	type: 'event'
	direction: WorkerEventDirection
	to: Receiver
	event: string
	data: any
	targetClientId?: string
	groupName?: string
}

export type WorkerSnapshotSerializeMessage = {
	type: 'snapshot:serialize'
	requestId: string
}

export type WorkerSnapshotSerializedMessage = {
	type: 'snapshot:serialized'
	requestId: string
	snapshot: GameSnapshotV1
}

export type WorkerSnapshotDeserializeMessage = {
	type: 'snapshot:deserialize'
	requestId: string
	snapshot: GameSnapshotV1
}

export type WorkerSnapshotDeserializedMessage = {
	type: 'snapshot:deserialized'
	requestId: string
}

export type WorkerMessageFromMain =
	| WorkerInitMessage
	| WorkerConnectMessage
	| WorkerDisconnectMessage
	| WorkerEventMessage
	| WorkerSnapshotSerializeMessage
	| WorkerSnapshotDeserializeMessage

export type WorkerMessageToMain =
	| WorkerReadyMessage
	| WorkerEventMessage
	| WorkerSnapshotSerializedMessage
	| WorkerSnapshotDeserializedMessage
