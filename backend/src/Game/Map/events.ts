import { Event } from '../../events'
import { MapData, MapLoadData, MapTransitionData } from './types'

export class MapEvents {
	static SC = {
		Load: 'sc:map:load',
		Transition: 'sc:map:transition'
	}

	static CS = {
		Load: 'cs:map:load',
		Transition: 'cs:map:transition'
	}
}