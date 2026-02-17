import type { WorkAssignment } from '../../Work/types'
import { WorkProviderType } from '../../Work/types'
import type { SettlerBehaviourDeps } from '../deps'

export const isWarehouseLogisticsAssignment = (assignment: WorkAssignment, managers: SettlerBehaviourDeps): boolean => {
	if (assignment.providerType !== WorkProviderType.Logistics || !assignment.buildingInstanceId) {
		return false
	}
	const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
	if (!building) {
		return false
	}
	const definition = managers.buildings.getBuildingDefinition(building.buildingId)
	return Boolean(definition?.isWarehouse)
}
