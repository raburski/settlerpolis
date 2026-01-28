export const NPCEvents = {
    CS: {
        Interact: 'cs:npc:interact'
    },
    SC: {
        List: 'sc:npc:list',
        Message: 'sc:npc:message',
        Action: 'sc:npc:action',
        Spawn: 'sc:npc:spawn',
        Despawn: 'sc:npc:despawn'
    },
    SS: {
        Go: 'ss:npc:go',
        SetAttribute: 'ss:npc:set_attribute',
        RemoveAttribute: 'ss:npc:remove_attribute'
    }
} as const
