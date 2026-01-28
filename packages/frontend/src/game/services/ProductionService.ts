import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'

// ProductionStatus enum (duplicated from game package until it's exported)
export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	NoWorker = 'no_worker'
}

export interface BuildingProductionState {
	buildingInstanceId: string
	status: ProductionStatus
	progress: number // 0-100
}

class ProductionServiceClass {
	private buildingProductions = new Map<string, BuildingProductionState>() // buildingInstanceId -> BuildingProductionState

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		// Handle production started
		EventBus.on(Event.Production.SC.ProductionStarted, (data: {
			buildingInstanceId: string
			recipe: any
		}) => {
			let production = this.buildingProductions.get(data.buildingInstanceId)
			if (!production) {
				production = {
					buildingInstanceId: data.buildingInstanceId,
					status: ProductionStatus.InProduction,
					progress: 0
				}
				this.buildingProductions.set(data.buildingInstanceId, production)
			} else {
				production.status = ProductionStatus.InProduction
				production.progress = 0
			}

			EventBus.emit('ui:production:updated', {
				buildingInstanceId: data.buildingInstanceId,
				production: { ...production }
			})
		})

		// Handle production stopped
		EventBus.on(Event.Production.SC.ProductionStopped, (data: {
			buildingInstanceId: string
		}) => {
			const production = this.buildingProductions.get(data.buildingInstanceId)
			if (production) {
				production.status = ProductionStatus.Idle
				production.progress = 0

				EventBus.emit('ui:production:updated', {
					buildingInstanceId: data.buildingInstanceId,
					production: { ...production }
				})
			}
		})

		// Handle production progress
		EventBus.on(Event.Production.SC.ProductionProgress, (data: {
			buildingInstanceId: string
			progress: number
		}) => {
			const production = this.buildingProductions.get(data.buildingInstanceId)
			if (production) {
				production.progress = data.progress

				EventBus.emit('ui:production:updated', {
					buildingInstanceId: data.buildingInstanceId,
					production: { ...production }
				})
			}
		})

		// Handle production completed
		EventBus.on(Event.Production.SC.ProductionCompleted, (data: {
			buildingInstanceId: string
			recipe: any
		}) => {
			const production = this.buildingProductions.get(data.buildingInstanceId)
			if (production) {
				production.progress = 100
				// Status will be updated by status changed event

				EventBus.emit('ui:production:updated', {
					buildingInstanceId: data.buildingInstanceId,
					production: { ...production }
				})
			}
		})

		// Handle status changed
		EventBus.on(Event.Production.SC.StatusChanged, (data: {
			buildingInstanceId: string
			status: ProductionStatus
		}) => {
			let production = this.buildingProductions.get(data.buildingInstanceId)
			if (!production) {
				production = {
					buildingInstanceId: data.buildingInstanceId,
					status: data.status,
					progress: 0
				}
				this.buildingProductions.set(data.buildingInstanceId, production)
			} else {
				production.status = data.status
			}

			EventBus.emit('ui:production:updated', {
				buildingInstanceId: data.buildingInstanceId,
				production: { ...production }
			})
		})
	}

	// Get production state for a building
	public getBuildingProduction(buildingInstanceId: string): BuildingProductionState | undefined {
		return this.buildingProductions.get(buildingInstanceId)
	}

	// Get production status for a building
	public getProductionStatus(buildingInstanceId: string): ProductionStatus {
		const production = this.buildingProductions.get(buildingInstanceId)
		return production?.status || ProductionStatus.Idle
	}

	// Get production progress for a building
	public getProductionProgress(buildingInstanceId: string): number {
		const production = this.buildingProductions.get(buildingInstanceId)
		return production?.progress || 0
	}
}

export const productionService = new ProductionServiceClass()

