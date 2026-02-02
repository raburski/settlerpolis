class NPCAssetsService {
	private readonly basePath = 'assets/npcs/'

	public getAvatarUrl(npcId: string): string {
		if (!npcId) {
			return `${this.basePath}placeholder/avatar.png`
		}
		return `${this.basePath}${npcId}/avatar.png`
	}
}

export const npcAssetsService = new NPCAssetsService()
