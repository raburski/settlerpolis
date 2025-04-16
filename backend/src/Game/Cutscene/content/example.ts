import { Cutscene } from '../types'
import { FXEvents } from '../../FX/events'
import { FXType } from '../../FX/types'
import { Event } from "../../../events"

export const introCutscene: Cutscene = {
	id: 'intro',
	skippable: true,
	steps: [
		{ event: Event.FX.SC.Play, payload: { type: FXType.HideUI }},
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 800 },
		{ event: Event.Chat.SC.Receive, payload: { message: '!' }, duration: 1000 },
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 1200 },
		{
			event: FXEvents.SC.Play,
			payload: {
				type: FXType.FadeToBlack
			},
			duration: 1000
		},
		{
			event: Event.Chat.SC.FullscreenMessage,
			payload: {
				message: 'Welcome to Rugtopolis',
				duration: 2000
			},
			duration: 2000
		},
		{
			event: Event.Chat.SC.FullscreenMessage,
			payload: {
				message: 'A world of adventure awaits...',
				duration: 1600
			},
			duration: 2000
		},
		{
			event: FXEvents.SC.Play,
			payload: {
				type: FXType.FadeFromBlack
			},
			duration: 1000
		},
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShowUI }},
	]
} 