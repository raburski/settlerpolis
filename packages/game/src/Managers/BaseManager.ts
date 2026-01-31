export class BaseManager<TDeps> {
	protected managers: TDeps

	constructor(managers: TDeps) {
		this.managers = managers
	}
}
