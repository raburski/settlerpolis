import { Cutscene } from '../types'
import { FXEvents } from '../../FX/events'
import { FXType } from '../../FX/types'
import { Event } from "../../../events"

export const introCutscene: Cutscene = {
	id: 'intro',
	skippable: true,
	steps: [
		{ event: Event.FX.SC.Play, payload: { type: FXType.DisplayUI, visible: false }},
		{ event: Event.FX.SC.Play, payload: { type: FXType.EnableControls, enabled: false }},
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 800 },
		{ event: Event.Chat.SC.Emoji, payload: { emoji: '❗️' }, duration: 1000 },
		{ event: Event.FX.SC.Play, payload: { type: FXType.ShakeScreen }, duration: 1200 },
		{
			event: FXEvents.SC.Play,
			payload: { type: FXType.FadeToBlack },
			duration: 1000
		},
		{
			event: Event.Chat.SC.Fullscreen,
			payload: { message: 'Welcome to Rugtopolis' },
			duration: 2000
		},
		{
			event: Event.Chat.SC.Fullscreen,
			payload: { message: 'A world of adventure awaits...' },
			duration: 1600
		},
		{
			event: FXEvents.SC.Play,
			payload: { type: FXType.FadeFromBlack },
			duration: 1000
		},
		{ event: Event.FX.SC.Play, payload: { type: FXType.DisplayUI, visible: true }},
		{ event: Event.FX.SC.Play, payload: { type: FXType.EnableControls, enabled: true }},
	]
} 