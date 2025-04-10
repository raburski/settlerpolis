import React, { useEffect, useState } from 'react'
import { Dialog } from '../types/Types'
import { NPCService } from '../services/NPCService'

import { EventBus } from '../EventBus'
import styles from './DialogUI.module.css'
import { Event, EventManager } from '../../../backend/src/Event'

interface DialogUIProps {
	npcService: NPCService
	eventBus: EventBus
}

export function DialogUI({ npcService, eventBus }: DialogUIProps) {
	const [dialog, setDialog] = useState<Dialog | null>(null)
	const [npcId, setNpcId] = useState<string | null>(null)

	useEffect(() => {
		const handleDialogUpdate = (data: { npcId: string, dialog: Dialog | null }) => {
			setDialog(data.dialog)
			setNpcId(data.npcId)
		}

		eventBus.on(Event.NPC.DialogUpdate, handleDialogUpdate)

		return () => {
			eventBus.off(Event.NPC.DialogUpdate, handleDialogUpdate)
		}
	}, [eventBus])

	if (!dialog) {
		return null
	}

	return (
		<div className={styles.dialogContainer}>
			<div className={styles.dialogContent}>
				<div className={styles.dialogText}>
					<p>{dialog.text}</p>
				</div>

				<div className={styles.responsesList}>
					{dialog.responses?.map((response, index) => (
						<button
							key={response.id}
							className={styles.responseButton}
							onClick={() => npcService.selectResponse(index)}
						>
							{response.text}
						</button>
					))}
				</div>

				{(!dialog.responses || dialog.responses.length === 0) && (
					<button
						className={styles.continueButton}
						onClick={() => npcService.closeDialog()}
					>
						Continue
					</button>
				)}

				<button
					className={styles.closeButton}
					onClick={() => npcService.closeDialog()}
				>
					Close
				</button>
			</div>
		</div>
	)
} 