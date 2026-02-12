import React, { useEffect, useMemo, useRef, useState } from 'react'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'
import { ResourceNodePopover } from './ResourceNodePanel'

type MapPopoverUpdate = {
	id: string
	kind: string
	anchor: { x: number; y: number }
	data?: Record<string, any>
}

type MapPopoverClose = {
	id?: string
	kind?: string
	all?: boolean
	exit?: { x: number; y: number }
}

type MapPopoverState = MapPopoverUpdate & { state: 'enter' | 'exit'; exitOffset?: { x: number; y: number } }

const EXIT_DURATION_MS = 160

export const MapPopoverLayer: React.FC = () => {
	const [popovers, setPopovers] = useState<Record<string, MapPopoverState>>({})
	const exitTimers = useRef<Map<string, number>>(new Map())
	const popoversRef = useRef<Record<string, MapPopoverState>>({})

	useEffect(() => {
		popoversRef.current = popovers
	}, [popovers])

	useEffect(() => {
		const handleUpdate = (data: MapPopoverUpdate) => {
			if (!data?.id || !data?.kind || !data?.anchor) return
			setPopovers((prev) => ({
				...prev,
				[data.id]: { ...data, state: 'enter' }
			}))
			const timer = exitTimers.current.get(data.id)
			if (timer) {
				window.clearTimeout(timer)
				exitTimers.current.delete(data.id)
			}
		}

		const scheduleRemoval = (id: string, exitOffset?: { x: number; y: number }) => {
			setPopovers((prev) => {
				const entry = prev[id]
				if (!entry) return prev
				return { ...prev, [id]: { ...entry, state: 'exit', exitOffset: exitOffset ?? entry.exitOffset } }
			})
			if (exitTimers.current.has(id)) return
			const timer = window.setTimeout(() => {
				exitTimers.current.delete(id)
				setPopovers((prev) => {
					const next = { ...prev }
					delete next[id]
					return next
				})
			}, EXIT_DURATION_MS)
			exitTimers.current.set(id, timer)
		}

		const scheduleBatchRemoval = (ids: string[], exitOffset?: { x: number; y: number }) => {
			if (ids.length === 0) return
			ids.forEach((id) => scheduleRemoval(id, exitOffset))
		}

		const handleClose = (data?: MapPopoverClose) => {
			if (!data || data.all) {
				const ids = Object.keys(popoversRef.current)
				setPopovers((prev) => {
					const next: Record<string, MapPopoverState> = {}
					for (const entry of Object.values(prev)) {
						next[entry.id] = { ...entry, state: 'exit', exitOffset: data?.exit ?? entry.exitOffset }
					}
					return next
				})
				scheduleBatchRemoval(ids, data?.exit)
				return
			}
			if (data.id) {
				scheduleRemoval(data.id, data.exit)
				return
			}
			if (data.kind) {
				const ids = Object.values(popoversRef.current)
					.filter((entry) => entry.kind === data.kind)
					.map((entry) => entry.id)
				scheduleBatchRemoval(ids, data.exit)
			}
		}

		EventBus.on(UiEvents.MapPopover.Update, handleUpdate)
		EventBus.on(UiEvents.MapPopover.Close, handleClose)

		return () => {
			EventBus.off(UiEvents.MapPopover.Update, handleUpdate)
			EventBus.off(UiEvents.MapPopover.Close, handleClose)
			exitTimers.current.forEach((timer) => window.clearTimeout(timer))
			exitTimers.current.clear()
		}
	}, [])

	const entries = useMemo(() => Object.values(popovers), [popovers])

	if (entries.length === 0) {
		return null
	}

	return (
		<>
			{entries.map((entry) => {
				switch (entry.kind) {
					case 'resource-node':
						return (
							<ResourceNodePopover
								key={entry.id}
								anchor={entry.anchor}
								data={entry.data}
								state={entry.state}
								exitOffset={entry.exitOffset}
							/>
						)
					default:
						return null
				}
			})}
		</>
	)
}
