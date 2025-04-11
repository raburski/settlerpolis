import { Events } from 'phaser';

class CustomEventBus extends Events.EventEmitter {
	private anyListeners: Array<(eventName: string, data: any) => void> = [];

	constructor() {
		super();
	}

	onAny(fn: (eventName: string, data: any) => void) {
		this.anyListeners.push(fn);
	}

	offAny(fn: (eventName: string, data: any) => void) {
		const index = this.anyListeners.indexOf(fn);
		if (index !== -1) {
			this.anyListeners.splice(index, 1);
		}
	}

	emit(event: string, ...args: any[]) {
		// Call original emit
		super.emit(event, ...args);

		// Notify any listeners
		this.anyListeners.forEach(fn => {
			fn(event, args[0]);
		});

		return true;
	}
}

// Used to emit events between React components and Phaser scenes
// https://newdocs.phaser.io/docs/3.70.0/Phaser.Events.EventEmitter
export const EventBus = new CustomEventBus();