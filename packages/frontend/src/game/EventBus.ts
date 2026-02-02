type Listener = (...args: any[]) => void

class CustomEventBus {
	private listeners: Map<string, Set<Listener>> = new Map()
	private anyListeners: Set<(eventName: string, data: any) => void> = new Set()
	private boundMap: WeakMap<Listener, Map<any, Listener>> = new WeakMap()

	on(event: string, fn: Listener, context?: any): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set())
		}
		const listener = context ? this.bind(fn, context) : fn
		this.listeners.get(event)?.add(listener)
	}

	once(event: string, fn: Listener, context?: any): void {
		const listener = context ? this.bind(fn, context) : fn
		const wrapped: Listener = (...args: any[]) => {
			this.off(event, wrapped)
			listener(...args)
		}
		this.on(event, wrapped)
	}

	off(event: string, fn: Listener, context?: any): void {
		const set = this.listeners.get(event)
		if (!set) return
		if (context) {
			const listener = this.bind(fn, context)
			set.delete(listener)
		} else {
			set.delete(fn)
			const bound = this.boundMap.get(fn)
			if (bound) {
				for (const listener of bound.values()) {
					set.delete(listener)
				}
			}
		}
		if (set.size === 0) {
			this.listeners.delete(event)
		}
	}

	removeListener(event: string, fn?: Listener): void {
		if (!fn) {
			this.listeners.delete(event)
			return
		}
		this.off(event, fn)
	}

	onAny(fn: (eventName: string, data: any) => void) {
		this.anyListeners.add(fn)
	}

	offAny(fn: (eventName: string, data: any) => void) {
		this.anyListeners.delete(fn)
	}

	emit(event: string, ...args: any[]): boolean {
		const set = this.listeners.get(event)
		if (set) {
			for (const fn of set) {
				fn(...args)
			}
		}
		for (const fn of this.anyListeners) {
			fn(event, args[0])
		}
		return true
	}

	private bind(fn: Listener, context: any): Listener {
		let contextMap = this.boundMap.get(fn)
		if (!contextMap) {
			contextMap = new Map()
			this.boundMap.set(fn, contextMap)
		}
		if (!contextMap.has(context)) {
			contextMap.set(context, fn.bind(context))
		}
		return contextMap.get(context) as Listener
	}
}

// Used to emit events between React components and game runtime
export const EventBus = new CustomEventBus()
