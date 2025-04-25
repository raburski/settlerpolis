import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// Configuration
const GAME_MODULES_PATH = path.resolve(__dirname, '../src/Game')
const CONTENT_PATH = path.resolve(__dirname, '../src/content')
const OUTPUT_FILE_PATH = path.resolve(__dirname, './defs.ts')

const allEvents: Record<string, Record<string, Record<string, string>>> = {}
const allTypes: string[] = []

// Function to get all subdirectories in a folder
function getSubdirectories(folderPath: string): string[] {
	const modules = fs.readdirSync(folderPath)
		.filter(item => {
			const itemPath = path.join(folderPath, item)
			return fs.statSync(itemPath).isDirectory() && item !== 'node_modules'
		})
	
	return modules
}

// Function to get folder structure as a string
function getFolderStructure(folderPath: string, indent: number = 0): string {
	const items = fs.readdirSync(folderPath)
	let structure = ''
	const spaces = ' '.repeat(indent)
	
	for (const item of items) {
		const itemPath = path.join(folderPath, item)
		const stat = fs.statSync(itemPath)
		
		if (stat.isDirectory()) {
			structure += `${spaces}${item}/\n`
			structure += getFolderStructure(itemPath, indent + 2)
		} else if (item.endsWith('.ts')) {
			structure += `${spaces}${item}\n`
		}
	}
	
	return structure
}

// Function to extract types and events from a module
function extractTypesAndEvents(rootPath: string) {
	// First check for types.ts in the root directory
	const rootTypesPath = path.join(rootPath, 'types.ts')
	if (fs.existsSync(rootTypesPath)) {
		try {
			const content = fs.readFileSync(rootTypesPath, 'utf8')
			// Remove import statements
			const contentWithoutImports = content.replace(/^import.*$/gm, '').trim()
			if (contentWithoutImports) {
				allTypes.push(contentWithoutImports)
			}
		} catch (err) {
			console.error(`Error reading ${rootTypesPath}:`, err)
		}
	}

	const modules = getSubdirectories(rootPath)
	
	// Function to recursively process files
	function processDirectory(dirPath: string) {
		const files = fs.readdirSync(dirPath)
		
		for (const file of files) {
			const filePath = path.join(dirPath, file)
			const stat = fs.statSync(filePath)
			
			if (stat.isDirectory()) {
				const moduleName = path.basename(filePath)
				const eventsPath = path.join(filePath, 'events.ts')
				const typesPath = path.join(filePath, 'types.ts')
				
				// Process types file if it exists
				if (fs.existsSync(typesPath)) {
					try {
						const content = fs.readFileSync(typesPath, 'utf8')
						// Remove import statements
						const contentWithoutImports = content.replace(/^import.*$/gm, '').trim()
						if (contentWithoutImports) {
							allTypes.push(contentWithoutImports)
						}
					} catch (err) {
						console.error(`Error reading ${typesPath}:`, err)
					}
				}
				
				// Process events file if it exists
				if (fs.existsSync(eventsPath)) {
					try {
						const content = fs.readFileSync(eventsPath, 'utf8')
						const match = content.match(/export const (\w+)Events\s*=/)
						
						if (match) {
							const tempDir = path.join(__dirname, '_temp')
							const tempFile = path.join(tempDir, 'events.ts')
							
							// Create temp directory if it doesn't exist
							if (!fs.existsSync(tempDir)) {
								fs.mkdirSync(tempDir)
							}
							
							// Copy the events file to temp directory
							fs.copyFileSync(eventsPath, tempFile)
							
							// Create a temporary file that imports and exports the events
							const mainFile = path.join(tempDir, 'main.ts')
							fs.writeFileSync(mainFile, `
								import { ${match[1]}Events } from './events'
								console.log(JSON.stringify(${match[1]}Events))
							`)
							
							try {
								// Compile and execute the temporary files
								execSync(`npx tsc ${mainFile} ${tempFile} --module commonjs --esModuleInterop true --target es2017`, { cwd: tempDir })
								const output = execSync(`node ${mainFile.replace('.ts', '.js')}`, { encoding: 'utf8', cwd: tempDir })
								const events = JSON.parse(output)
								
								// Store the events with the module name as the key
								allEvents[moduleName] = events
								console.log(`Processed events for module: ${moduleName}`)
							} catch (err) {
								console.error(`Error processing ${eventsPath}:`, err)
							} finally {
								// Clean up temporary files
								try {
									fs.rmSync(tempDir, { recursive: true, force: true })
								} catch (err) {
									console.error(`Error cleaning up temp directory:`, err)
								}
							}
						}
					} catch (err) {
						console.error(`Error reading ${eventsPath}:`, err)
					}
				}
				
				// Continue processing subdirectories
				processDirectory(filePath)
			}
		}
	}
	
	processDirectory(rootPath)
}

// Function to convert an object to a TypeScript string representation
function objectToTypeScript(obj: Record<string, any>, indent: number = 0): string {
	const spaces = ' '.repeat(indent)
	let result = '{\n'
	
	// Sort keys to ensure consistent output
	const sortedKeys = Object.keys(obj).sort()
	
	for (const key of sortedKeys) {
		const value = obj[key]
		if (typeof value === 'object' && value !== null) {
			const nestedResult = objectToTypeScript(value, indent + 2)
			if (nestedResult.trim()) {
				result += `${spaces}  ${key}: ${nestedResult},\n`
			}
		} else if (value !== undefined) {
			result += `${spaces}  ${key}: '${value}',\n`
		}
	}
	
	result += `${spaces}}`
	return result
}

// Main function to generate the consolidated file
function generateDefsFile() {
	// Extract types and events from Game modules
	extractTypesAndEvents(GAME_MODULES_PATH)
	
	// Extract types from Content directory
	extractTypesAndEvents(CONTENT_PATH)
	
	// Remove duplicates from types
	const uniqueTypes = [...new Set(allTypes)]
	
	// Get content folder structure
	const contentStructure = getFolderStructure(CONTENT_PATH)
	
	// Generate the output file content
	const outputContent = `/**
 * Auto-generated types and events definitions
 * Generated on: ${new Date().toISOString()}
 */

/**
 * Content folder structure:
${contentStructure}
 */

// Types
${uniqueTypes.join('\n\n')}

// Events
export const Event = ${objectToTypeScript(allEvents)}
`
	
	// Write to file
	fs.writeFileSync(OUTPUT_FILE_PATH, outputContent)
	console.log(`Generated definitions file at: ${OUTPUT_FILE_PATH}`)
}

// Execute the script
generateDefsFile() 