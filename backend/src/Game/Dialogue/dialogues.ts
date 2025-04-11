import { dialogue as exampleDialogue } from './content/example'
import { dialogue as innkeeperDialogue } from './content/innkeeper'

// Define the dialogues as TypeScript objects to avoid JSON parsing issues
export const dialogues = {
	[exampleDialogue.id]: exampleDialogue,
	[innkeeperDialogue.id]: innkeeperDialogue
} 