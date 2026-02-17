import { EventClient } from '../events'
import { Receiver } from "../Receiver"
import { FXEvents } from './events'
import { FXPlayEventData } from './types'
import { FXManagerState } from './FXManagerState'

export class FXManager {
	private readonly state = new FXManagerState()

	play(client: EventClient, data: FXPlayEventData) {
		client.emit(Receiver.Sender, FXEvents.SC.Play, data)
	}
}

export * from './FXManagerState'
