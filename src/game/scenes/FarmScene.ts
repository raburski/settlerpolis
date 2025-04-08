import { MapScene } from './MapScene'

export class FarmScene extends MapScene {
	constructor() {
		super('FarmScene', 'farm-map', 'assets/maps/test1.json')
	}

	protected loadAdditionalAssets(): void {
		// Load any additional assets specific to the farm scene
		this.load.image('blockchain', 'assets/objects/blockchain.png')
	}
}