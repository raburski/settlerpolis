/**
 * This file re-exports events from the backend to provide a centralized
 * location for accessing event types in the frontend.
 */

import { Event } from '../../backend/src/events'
import { ItemsEvents } from '../../backend/src/Game/Items/events'
import { DialogueEvents } from '../../backend/src/Game/Dialogue/events'
import { MapObjectsEvents } from '../../backend/src/Game/MapObjects/events'

export { Event, ItemsEvents, DialogueEvents, MapObjectsEvents } 