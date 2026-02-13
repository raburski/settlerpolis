import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'

type LogConsoleEventData = {
	manager: string
	level: 'debug' | 'info' | 'warn' | 'error'
	message: string
	args: string[]
	timestamp: number
}

const formatPrefix = (data: LogConsoleEventData) => {
	const ts = new Date(data.timestamp).toISOString()
	return `[GameLog][${ts}][${data.manager}]`
}

EventBus.on(Event.Logs.SC.Console, (data: LogConsoleEventData) => {
	const prefix = formatPrefix(data)
	const payload = data.args && data.args.length > 0 ? data.args : [data.message]
	switch (data.level) {
		case 'debug':
			console.debug(prefix, ...payload)
			break
		case 'warn':
			console.warn(prefix, ...payload)
			break
		case 'error':
			console.error(prefix, ...payload)
			break
		case 'info':
		default:
			console.log(prefix, ...payload)
			break
	}
})
