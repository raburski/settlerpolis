export enum TutorialFlag {
	NPCInteract = 'npc_interact'
}

class TutorialService {
	private flags: Set<TutorialFlag> = new Set()

	constructor() {
		// Load saved flags from localStorage
		this.loadFlags()
	}

	private loadFlags() {
		const savedFlags = localStorage.getItem('tutorial_flags')
		if (savedFlags) {
			const parsedFlags = JSON.parse(savedFlags) as TutorialFlag[]
			parsedFlags.forEach(flag => this.flags.add(flag))
		}
	}

	private saveFlags() {
		const flagsArray = Array.from(this.flags)
		localStorage.setItem('tutorial_flags', JSON.stringify(flagsArray))
	}

	public hasCompleted(flag: TutorialFlag): boolean {
		return this.flags.has(flag)
	}

	public complete(flag: TutorialFlag) {
		this.flags.add(flag)
		this.saveFlags()
	}

	public reset() {
		this.flags.clear()
		localStorage.removeItem('tutorial_flags')
	}
}

// Export singleton instance
export const tutorialService = new TutorialService() 