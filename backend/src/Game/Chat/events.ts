export const ChatEvents = {
	CS: {
		Send: 'cs:chat:send'
	},
	SC: {
		Receive: 'sc:chat:receive',
		SystemMessage: 'sc:chat:system_message',
		FullscreenMessage: 'sc:chat:fullscreen_message'
	}
} as const 