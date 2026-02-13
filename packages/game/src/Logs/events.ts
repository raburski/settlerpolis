export const LogsEvents = {
	SC: {
		Console: 'sc:logs:console'
	}
} as const

export type LogConsoleEventData = {
	manager: string
	level: 'debug' | 'info' | 'warn' | 'error'
	message: string
	args: string[]
	timestamp: number
}
