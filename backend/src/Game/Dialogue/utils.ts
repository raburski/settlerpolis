import { DialogueTree, DialogueTreePartial } from './types'

/**
 * Combines multiple DialogueTreePartial objects into a single DialogueTree
 * @param base Base dialogue tree with required id and npcId
 * @param partials Additional dialogue tree partials to merge
 * @returns A complete DialogueTree
 */
export function dialogueCompose(
	base: { id: string; npcId: string },
	...partials: DialogueTreePartial[]
): DialogueTree {
	// Start with the base dialogue tree
	const result: DialogueTree = {
		id: base.id,
		npcId: base.npcId,
		nodes: {},
		startNode: 'start' // Default start node
	}

	// Merge all partials
	partials.forEach(partial => {
		// Merge nodes
		if (partial.nodes) {
			Object.entries(partial.nodes).forEach(([nodeId, node]) => {
				if (result.nodes[nodeId]) {
					// If node exists, merge options and other properties
					result.nodes[nodeId] = {
						...result.nodes[nodeId],
						...node,
						options: [
							...(result.nodes[nodeId].options || []),
							...(node.options || [])
						]
					}
				} else {
					// If node doesn't exist, add it
					result.nodes[nodeId] = node
				}
			})
		}

		// Use the first non-empty startNode
		if (partial.startNode && !result.startNode) {
			result.startNode = partial.startNode
		}
	})

	// Ensure we have a startNode
	if (!result.startNode) {
		result.startNode = 'start'
	}

	return result
} 