export const QuestEvents = {
	SS: {
		Start: 'ss:quest:start'
	},
	SC: {
		Start: 'sc:quest:start',
		Update: 'sc:quest:update',
		StepComplete: 'sc:quest:step_complete',
		Complete: 'sc:quest:complete',
		List: 'sc:quest:list'
	}
} as const 