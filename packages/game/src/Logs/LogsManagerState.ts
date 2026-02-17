import type { Logger, LogEventPayload, LogLevel } from './index'

export interface LoggerConfigState {
	enabled: boolean
	level: LogLevel
}

export class LogsManagerState {
	public loggers = new Map<string, Logger>()
	public configs = new Map<string, LoggerConfigState>()
	public globalLevel: LogLevel
	public globalEnabled = true
	public allowedManagers: Set<string> | null = null
	public eventEmitter: ((payload: LogEventPayload) => void) | null = null

	constructor(globalLevel: LogLevel) {
		this.globalLevel = globalLevel
	}
}
