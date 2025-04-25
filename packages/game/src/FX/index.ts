import { EventClient } from '../events'
import { Receiver } from "../Receiver"
import { FXEvents } from './events'
import { FXPlayEventData } from './types'

export class FXManager {
	play(client: EventClient, data: FXPlayEventData) {
		client.emit(Receiver.Sender, FXEvents.SC.Play, data)
	}
} 