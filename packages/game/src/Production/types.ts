export interface ProductionRecipe {
	inputs: Array<{
		itemType: string
		quantity: number
	}>
	outputs: Array<{
		itemType: string
		quantity: number
	}>
	productionTime: number // Time in seconds to produce one batch
}

export interface BuildingProduction {
	buildingInstanceId: string
	status: ProductionStatus
	progress: number // 0-100
	currentBatchStartTime?: number
	isProducing: boolean
}

export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	NoWorker = 'no_worker' // Building requires worker but none assigned
}

