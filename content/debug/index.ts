// Export all content modules
export { cutscenes } from './general/cutscenes'
export { items } from './general/items'
export { npcs } from './general/npcs'
export { maps } from './general/maps'
export { quests } from './general/quests'
export { schedules } from './general/schedules'
export { triggers } from './general/triggers'
export { flags } from './general/flags'
// Explicitly export buildings to ensure it's included
export { buildings } from './general/buildings'
export { professions } from './general/professions'
export { professionTools } from './general/professionTools'
export { startingItems } from './general/startingItems'

// Set the default map ID
export const defaultMap = 'test1'