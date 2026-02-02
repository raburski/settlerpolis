import { MapUrlService, MapId } from "@rugged/game"

/**
 * Frontend implementation of MapUrlService that loads maps from the public assets folder
 */
export class FrontendMapUrlService implements MapUrlService {
	constructor(private baseUrl: string = "/assets/maps/") {}

	getMapUrl(mapName: MapId): string {
		return `${this.baseUrl}${mapName}.json`
	}
}
