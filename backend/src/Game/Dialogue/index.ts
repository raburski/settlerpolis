import { EventManager, Event } from '../../events'
import { Receiver } from '../../Receiver'
import { DialogueTree, DialogueNode, DialogueContinueData, DialogueChoiceData } from './types'
import { DialogueEvents } from './events'
import * as fs from 'fs'
import * as path from 'path'

export class DialogueManager {
	private dialogues = new Map<string, DialogueTree>()
	private activeDialogues = new Map<string, string>() // clientId -> dialogueId

	constructor(private event: EventManager) {
		this.setupEventHandlers()
		this.loadDialogues()
	}

	private loadDialogues() {
		const contentPath = path.join(__dirname, 'content')
		try {
			const files = fs.readdirSync(contentPath)
			for (const file of files) {
				if (path.extname(file) === '.json') {
					const filePath = path.join(contentPath, file)
					const content = fs.readFileSync(filePath, 'utf-8')
					const dialogue = JSON.parse(content) as DialogueTree
					this.registerDialogue(dialogue)
				}
			}
		} catch (error) {
			console.error('Error loading dialogues:', error)
		}
	}

	private setupEventHandlers() {
		// Handle dialogue continue
		this.event.on<DialogueContinueData>(DialogueEvents.CS.Continue, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			const dialogue = this.dialogues.get(dialogueId)
			if (!dialogue) return

			const currentNode = this.getCurrentNode(client.id)
			if (!currentNode?.next) {
				this.endDialogue(client)
				return
			}

			const nextNode = dialogue.nodes[currentNode.next]
			if (!nextNode) {
				this.endDialogue(client)
				return
			}

			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: nextNode
			})
		})

		// Handle dialogue choice
		this.event.on<DialogueChoiceData>(DialogueEvents.CS.Choice, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			const currentNode = this.getCurrentNode(client.id)
			if (!currentNode?.options) return

			const selectedOption = currentNode.options.find(opt => opt.id === data.choiceId)
			if (!selectedOption?.next) {
				this.endDialogue(client)
				return
			}

			const dialogue = this.dialogues.get(dialogueId)
			if (!dialogue) return

			const nextNode = dialogue.nodes[selectedOption.next]
			if (!nextNode) {
				this.endDialogue(client)
				return
			}

			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: nextNode
			})
		})
	}

	public registerDialogue(dialogue: DialogueTree) {
		this.dialogues.set(dialogue.id, dialogue)
		console.log(`Registered dialogue: ${dialogue.id}`)
	}

	public triggerDialogue(client: EventClient, dialogueId: string) {
		const dialogue = this.dialogues.get(dialogueId)
		if (!dialogue) return

		const startNode = dialogue.nodes[dialogue.startNode]
		if (!startNode) return

		this.activeDialogues.set(client.id, dialogueId)
		client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
			dialogueId,
			node: startNode
		})
	}

	private getCurrentNode(clientId: string): DialogueNode | undefined {
		const dialogueId = this.activeDialogues.get(clientId)
		if (!dialogueId) return

		const dialogue = this.dialogues.get(dialogueId)
		if (!dialogue) return

		return dialogue.nodes[dialogue.startNode]
	}

	private endDialogue(client: EventClient) {
		const dialogueId = this.activeDialogues.get(client.id)
		if (!dialogueId) return

		this.activeDialogues.delete(client.id)
		client.emit(Receiver.Sender, DialogueEvents.SC.End, { dialogueId })
	}
} 