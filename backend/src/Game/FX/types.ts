export enum FXType {
	FadeToBlack = 'fadeToBlack',
	FadeFromBlack = 'fadeFromBlack',
	MoveCameraTo = 'moveCameraTo',
	ShakeScreen = 'shakeScreen',
	FocusOnNPC = 'focusOnNPC',
    HideUI = 'hideUI',
    ShowUI = 'showUI',
}

export interface FXPlayEventData {
	type: FXType
	payload?: Record<string, any>
} 