export const UiEvents = {
	Scene: {
		Ready: 'ui:scene:ready'
	},
	Settings: {
		Toggle: 'ui:settings:toggle',
		HighFidelity: 'ui:settings:high-fidelity'
	},
	Inventory: {
		Toggle: 'ui:inventory:toggle',
		DragEnter: 'inventory:item:dragEnter',
		DragLeave: 'inventory:item:dragLeave'
	},
	Quests: {
		Toggle: 'ui:quests:toggle'
	},
	Relationships: {
		Toggle: 'ui:relationships:toggle'
	},
	Chat: {
		Toggle: 'ui:chat:toggle'
	},
	Construction: {
		Toggle: 'ui:construction:toggle',
		Select: 'ui:construction:select',
		Cancel: 'ui:construction:cancel'
	},
	Road: {
		Select: 'ui:road:select',
		Cancel: 'ui:road:cancel',
		Cancelled: 'ui:road:cancelled'
	},
	Building: {
		Click: 'ui:building:click',
		Select: 'ui:building:select',
		Close: 'ui:building:close',
		Updated: 'ui:building:updated',
		Highlight: 'ui:building:highlight',
		WorkAreaSelect: 'ui:building:work-area:select',
		WorkAreaCancel: 'ui:building:work-area:cancel'
	},
	Settler: {
		Click: 'ui:settler:click',
		Close: 'ui:settler:close',
		Highlight: 'ui:settler:highlight'
	},
	Population: {
		StatsUpdated: 'ui:population:stats-updated',
		SettlerSpawned: 'ui:population:settler-spawned',
		SettlerDied: 'ui:population:settler-died',
		SettlerUpdated: 'ui:population:settler-updated',
		ProfessionChanged: 'ui:population:profession-changed',
		WorkerAssigned: 'ui:population:worker-assigned',
		WorkerUnassigned: 'ui:population:worker-unassigned',
		WorkerRequestFailed: 'ui:population:worker-request-failed',
		ListLoaded: 'ui:population:list-loaded'
	},
	Logistics: {
		Updated: 'ui:logistics:updated'
	},
	Storage: {
		Updated: 'ui:storage:updated',
		SlotUpdated: 'ui:storage:slot-updated'
	},
	Production: {
		Updated: 'ui:production:updated'
	},
	Dialogue: {
		AnimationStart: 'ui:dialogue:animation:start',
		AnimationEnd: 'ui:dialogue:animation:end',
		ResponsesShow: 'ui:dialogue:responses:show',
		SkipAnimation: 'ui:dialogue:skip-animation',
		OptionUp: 'ui:dialogue:option:up',
		OptionDown: 'ui:dialogue:option:down',
		OptionConfirm: 'ui:dialogue:option:confirm',
		Close: 'ui:dialogue:close',
		OptionsUpdate: 'ui:dialogue:options:update'
	},
	Notifications: {
		UiNotification: 'ui:notification',
		SystemMessage: 'ui:message:system'
	},
	CityCharter: {
		Updated: 'ui:city-charter:updated'
	},
	Trade: {
		Updated: 'ui:trade:updated'
	},
	Debug: {
		BoundsToggle: 'ui:debug:bounds-toggle'
	}
} as const
