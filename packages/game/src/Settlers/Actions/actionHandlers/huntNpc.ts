import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'
import { calculateDistance } from '../../../utils'

const MAX_HUNT_RANGE = 96

export const HuntNpcActionHandler: ActionHandler = {
	type: WorkActionType.HuntNpc,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.HuntNpc) {
			return
		}

		const npc = managers.npc.getNPC(action.npcId)
		if (!npc || npc.active === false) {
			fail(SettlerActionFailureReason.NpcMissing)
			return
		}
		if (action.wildlifeType && npc.attributes?.wildlifeType && npc.attributes.wildlifeType !== action.wildlifeType) {
			fail(SettlerActionFailureReason.WrongTarget)
			return
		}

		const settler = managers.population.getSettler(settlerId)
		if (settler) {
			const distance = calculateDistance(settler.position, npc.position)
			if (distance > MAX_HUNT_RANGE) {
				fail(SettlerActionFailureReason.OutOfRange)
				return
			}
		}

		if (action.wildlifeType === 'deer') {
			managers.wildlife.reportDeerKilled(action.npcId)
		} else {
			managers.npc.removeNPC(action.npcId)
		}

		managers.population.setSettlerCarryingItem(settlerId, action.outputItemType, action.quantity)
		complete()
	}
}
