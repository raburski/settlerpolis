import { MapScene } from './MapScene'

export class FountainScene extends MapScene {
	constructor() {
		super('FountainScene', 'fountain-map', 'assets/maps/test2.json')
	}

	protected loadAdditionalAssets(): void {
		// No additional assets needed for this scene
	}
} 