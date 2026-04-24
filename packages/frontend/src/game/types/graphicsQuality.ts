export enum GraphicsQuality {
	Low = 'low',
	Medium = 'medium',
	High = 'high'
}

export const GRAPHICS_QUALITY_VALUES: readonly GraphicsQuality[] = [
	GraphicsQuality.Low,
	GraphicsQuality.Medium,
	GraphicsQuality.High
] as const

export const isGraphicsQuality = (value: unknown): value is GraphicsQuality => {
	return typeof value === 'string' && (GRAPHICS_QUALITY_VALUES as readonly string[]).includes(value)
}

