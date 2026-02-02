import type { ModelBuilder, RenderDescriptor, ModelContext } from './types'

export class ModelRegistry {
	private builders: Map<string, ModelBuilder> = new Map()

	register(type: string, builder: ModelBuilder): void {
		this.builders.set(type, builder)
	}

	has(type: string): boolean {
		return this.builders.has(type)
	}

	build(descriptor: RenderDescriptor, context: ModelContext): any {
		const builder = this.builders.get(descriptor.type)
		if (!builder) {
			throw new Error(`No model builder registered for ${descriptor.type}`)
		}
		return builder(descriptor, context)
	}
}
