import { Cutscene } from '../types'
import { FXEvents } from '../../FX/events'
import { FXType } from '../../FX/types'
import { Event } from "../../../events"

export const introCutscene: Cutscene = {
	id: 'intro',
	skippable: true,
	steps: [
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 800 },
		{ event: Event.Chat.SC.Receive, payload: { message: '!' }, duration: 1000 },
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 2000 },
		{
			event: FXEvents.SC.Play,
			payload: {
				type: FXType.FadeToBlack
			},
			duration: 1000
		},
		{
			event: 'sc:cutscene:showText',
			payload: {
				text: 'Welcome to Rugtopolis',
				duration: 3000
			},
			duration: 3000
		},
		{
			event: 'sc:cutscene:showText',
			payload: {
				text: 'A world of adventure awaits...',
				duration: 3000
			},
			duration: 3000
		},
		{
			event: FXEvents.SC.Play,
			payload: {
				type: FXType.FadeFromBlack
			},
			duration: 1000
		}
	]
} 