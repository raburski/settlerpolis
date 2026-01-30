import type { WorkProvider, WorkProviderId } from './types'

export class ProviderRegistry {
	private providers = new Map<WorkProviderId, WorkProvider>()

	public register(provider: WorkProvider): void {
		this.providers.set(provider.id, provider)
	}

	public unregister(providerId: WorkProviderId): void {
		this.providers.delete(providerId)
	}

	public get(providerId: WorkProviderId): WorkProvider | undefined {
		return this.providers.get(providerId)
	}

	public getAll(): WorkProvider[] {
		return Array.from(this.providers.values())
	}
}
