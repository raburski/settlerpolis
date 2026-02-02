export class ReservationBag {
	private releaseFns: Array<() => void> = []
	private released = false

	public add(releaseFn: () => void): void {
		if (this.released) {
			releaseFn()
			return
		}
		this.releaseFns.push(releaseFn)
	}

	public releaseAll(): void {
		if (this.released) {
			return
		}
		this.released = true
		for (const releaseFn of this.releaseFns) {
			releaseFn()
		}
		this.releaseFns = []
	}
}
