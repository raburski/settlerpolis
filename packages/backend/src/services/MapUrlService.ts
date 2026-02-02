import { MapUrlService, MapId } from "@rugged/game"

/**
 * Backend implementation of MapUrlService that returns full URLs for maps
 */
export class BackendMapUrlService implements MapUrlService {
	private baseUrl: string

	constructor(private apiBasePath: string = "/api/maps/", hostUrl?: string) {
		// Use the provided hostUrl or try to determine from environment variables
		this.baseUrl = hostUrl || process.env.PUBLIC_URL || process.env.RAILWAY_STATIC_URL || ""
		
		// Ensure we don't have double slashes when combining the baseUrl and apiBasePath
		if (this.baseUrl && !this.baseUrl.endsWith("/") && this.apiBasePath.startsWith("/")) {
			// All good, we'll combine them correctly
		} else if (this.baseUrl && this.baseUrl.endsWith("/") && this.apiBasePath.startsWith("/")) {
			// Remove the leading slash from apiBasePath to avoid double slash
			this.apiBasePath = this.apiBasePath.substring(1)
		}
	}

	getMapUrl(mapId: MapId): string {
		// Return the full URL that points to our API endpoint
		return `${this.baseUrl}${this.apiBasePath}${mapId}.json`
	}
} 
