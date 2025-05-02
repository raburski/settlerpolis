#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get game content from env variable or use default
const gameContent = process.env.VITE_GAME_CONTENT || 'debug';

// Define paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(packageDir, '../..');
const contentDir = path.join(rootDir, 'content', gameContent);
const sourceDir = path.join(contentDir, 'maps/assets');
const targetDir = path.join(contentDir, 'maps');

/**
 * Processes JSON files by copying them to the target directory,
 * changing extension to .js, and prepending "export default "
 */
function processJsonFiles() {
	if (!fs.existsSync(sourceDir)) {
		console.error(`Source directory does not exist: ${sourceDir}`);
		return;
	}

	// Ensure target directory exists
	if (!fs.existsSync(targetDir)) {
		fs.mkdirSync(targetDir, { recursive: true });
		console.log(`Created directory: ${targetDir}`);
	}

	console.log(`Processing JSON files from ${sourceDir} to ${targetDir}`);

	// Read all files in the source directory
	const files = fs.readdirSync(sourceDir);
	
	// Filter JSON files and process them
	files.forEach(file => {
		const sourcePath = path.join(sourceDir, file);
		
		// Skip directories
		if (fs.statSync(sourcePath).isDirectory()) {
			return;
		}
		
		// Only process JSON files
		if (path.extname(file).toLowerCase() === '.json') {
			const baseName = path.basename(file, '.json');
			const targetPath = path.join(targetDir, `${baseName}.js`);
			
			// Read JSON file
			const jsonContent = fs.readFileSync(sourcePath, 'utf8');
			
			// Write content with "export default " prefix
			fs.writeFileSync(targetPath, `export default ${jsonContent}`);
			
			console.log(`Processed: ${file} → ${baseName}.js`);
		}
	});
}

// Main execution
try {
	console.log(`Exporting maps for game content: ${gameContent}`);
	processJsonFiles();
	console.log('Map export completed successfully');
} catch (error) {
	console.error('Error exporting maps:', error);
	process.exit(1);
} 