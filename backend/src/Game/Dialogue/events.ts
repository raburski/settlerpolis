export const DialogueEvents = {
	SC: {
		Trigger: 'sc:dialogue:trigger',
		End: 'sc:dialogue:end'
	},
	CS: {
		Continue: 'cs:dialogue:continue',
		Choice: 'cs:dialogue:choice',
		End: 'cs:dialogue:end'
	}
} as const 