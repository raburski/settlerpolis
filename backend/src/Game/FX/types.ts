export enum FXType {
	FadeToBlack = 'fadeToBlack',
	FadeFromBlack = 'fadeFromBlack',
	MoveCameraTo = 'moveCameraTo',
	ShakeScreen = 'shakeScreen',
	FocusOnNPC = 'focusOnNPC'
}

export interface FXPlayEventData {
	type: FXType
	payload?: Record<string, any>
} 