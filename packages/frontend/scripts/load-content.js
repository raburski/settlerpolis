#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { generateBuildingsModule } from './buildings-module.js';

// Define paths for setting up environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(frontendDir, '../..');
const gameDir = path.resolve(rootDir, 'packages/game');
const gameScriptPath = path.join(gameDir, 'scripts/export-maps.js');

// If VITE_GAME_CONTENT isn't already set via --env-file, try to load it from .env.development
if (!process.env.VITE_GAME_CONTENT) {
  // Try to load from .env.development first, then fallback to .env.production
  const envPaths = [
    path.resolve(frontendDir, '.env.development'),
    path.resolve(frontendDir, '.env.production'),
    path.resolve(frontendDir, '.env')
  ];
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      config({ path: envPath });
      console.log(`Loaded environment from ${envPath}`);
      break;
    }
  }
}

// Get game content from env variable or use default
const gameContent = process.env.VITE_GAME_CONTENT || 'settlerpolis';
console.log(`Loading content for game: ${gameContent}`);

// Function to run the export-maps script
async function runExportMapsScript() {
  console.log(`Running map export script from ${gameScriptPath}`);
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [gameScriptPath], {
      env: { ...process.env },
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('Map export completed successfully');
        resolve();
      } else {
        reject(new Error(`Map export script exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to run map export script: ${error.message}`));
    });
  });
}

// Define content paths
const contentDir = path.join(rootDir, 'content', gameContent);
const mapsAssetsDir = path.join(contentDir, 'maps');
const npcsAssetsDir = path.join(contentDir, 'npcs');
const itemsAssetsDir = path.join(contentDir, 'items');
const libraryAssetsDir = path.join(contentDir, 'assets');
const resourceRenderSource = path.join(contentDir, 'resourceNodeRenders.json');
const itemRenderSource = path.join(contentDir, 'itemRenders.json');
const mapsTargetDir = path.join(frontendDir, 'public/assets/maps');
const npcsTargetDir = path.join(frontendDir, 'public/assets/npcs');
const itemsTargetDir = path.join(frontendDir, 'public/assets/items');
const libraryTargetDir = path.join(frontendDir, 'public/assets/library');
const resourceRenderTarget = path.join(frontendDir, 'public/assets/resource-node-renders.json');
const itemRenderTarget = path.join(frontendDir, 'public/assets/item-renders.json');
const assetIndexTarget = path.join(frontendDir, 'public/assets/asset-index.json');

// Create target directories if they don't exist
;[mapsTargetDir, npcsTargetDir, itemsTargetDir, libraryTargetDir].forEach(dir => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		console.log(`Created directory: ${dir}`);
	}
});

const generation = generateBuildingsModule(contentDir);
if (generation?.success) {
  console.log(`Generated buildings module at ${generation.buildingsModulePath}`);
}

// Function to copy files from source to target
function copyFiles(sourceDir, targetDir, extensions) {
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory does not exist: ${sourceDir}`);
    return;
  }

  // Read all files in the source directory
  const files = fs.readdirSync(sourceDir);
  
  // Filter files by extension and copy them
  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    
    // Handle file destination path
    let destFile = file;
    let destPath = targetDir;
    
    // Skip if it's a directory
    if (fs.statSync(sourcePath).isDirectory()) {
      // For directories like "assets", copy their contents directly to targetDir
      if (file === 'assets') {
        copyFiles(sourcePath, targetDir, extensions);
      } else {
        // For other directories, maintain their structure
        const newTargetDir = path.join(targetDir, file);
        if (!fs.existsSync(newTargetDir)) {
          fs.mkdirSync(newTargetDir, { recursive: true });
        }
        copyFiles(sourcePath, newTargetDir, extensions);
      }
      return;
    }
    
    // Check if the file has one of the specified extensions
    const ext = path.extname(file).toLowerCase();
    if (extensions.includes(ext)) {
      // Copy the file
      const targetPath = path.join(destPath, destFile);
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`Copied: ${file} to ${targetPath}`);
    }
  });
}

const modelExtensions = ['.glb', '.gltf', '.babylon'];
const assetExtensions = [...modelExtensions, '.bin', '.png', '.jpg', '.jpeg', '.ktx2', '.webp'];

function collectAssetFiles(sourceDir, extensions, baseDir = sourceDir) {
	if (!fs.existsSync(sourceDir)) {
		return [];
	}
	const entries = fs.readdirSync(sourceDir);
	let results = [];
	entries.forEach((entry) => {
		const entryPath = path.join(sourceDir, entry);
		const stat = fs.statSync(entryPath);
		if (stat.isDirectory()) {
			results = results.concat(collectAssetFiles(entryPath, extensions, baseDir));
			return;
		}
		const ext = path.extname(entry).toLowerCase();
		if (!extensions.includes(ext)) {
			return;
		}
		const relativePath = path.relative(baseDir, entryPath);
		results.push(relativePath);
	});
	return results;
}

function copyAssetLibrary(sourceDir, targetDir, extensions, publicPath, indexEntries) {
	if (!fs.existsSync(sourceDir)) {
		console.error(`Source directory does not exist: ${sourceDir}`);
		return;
	}
	const files = collectAssetFiles(sourceDir, extensions);
	files.forEach((relativePath) => {
		const sourcePath = path.join(sourceDir, relativePath);
		const targetPath = path.join(targetDir, relativePath);
		const targetFolder = path.dirname(targetPath);
		if (!fs.existsSync(targetFolder)) {
			fs.mkdirSync(targetFolder, { recursive: true });
		}
		fs.copyFileSync(sourcePath, targetPath);
		const ext = path.extname(relativePath).toLowerCase();
		if (modelExtensions.includes(ext)) {
			const webPath = `${publicPath}/${relativePath.split(path.sep).join('/')}`;
			indexEntries.push(webPath);
		}
	});
	console.log(`Copied ${files.length} asset files from ${sourceDir} to ${targetDir}`);
}

// Main execution
(async function main() {
  try {
    // First run the export-maps script
    await runExportMapsScript();
    
    // Then copy map assets to frontend
    console.log(`Copying map assets from ${mapsAssetsDir} to ${mapsTargetDir}`);
    copyFiles(mapsAssetsDir, mapsTargetDir, ['.png', '.json']);
    
    // Copy NPC assets to frontend
    console.log(`Copying NPC assets from ${npcsAssetsDir} to ${npcsTargetDir}`);
    copyFiles(npcsAssetsDir, npcsTargetDir, ['.png', '.json']);
    
	// Copy items assets to frontend
	console.log(`Copying items assets from ${itemsAssetsDir} to ${itemsTargetDir}`);
	copyFiles(itemsAssetsDir, itemsTargetDir, ['.png', '.json']);

	const assetIndexEntries = [];
	console.log(`Copying asset library from ${libraryAssetsDir} to ${libraryTargetDir}`);
	copyAssetLibrary(libraryAssetsDir, libraryTargetDir, assetExtensions, '/assets/library', assetIndexEntries);

	if (fs.existsSync(resourceRenderSource)) {
		fs.copyFileSync(resourceRenderSource, resourceRenderTarget);
		console.log(`Copied resource node render config to ${resourceRenderTarget}`);
	} else {
		console.warn(`Resource node render config not found at ${resourceRenderSource}`);
	}

	if (fs.existsSync(itemRenderSource)) {
		fs.copyFileSync(itemRenderSource, itemRenderTarget);
		console.log(`Copied item render config to ${itemRenderTarget}`);
	} else {
		console.warn(`Item render config not found at ${itemRenderSource}`);
	}

	const assetIndex = {
		generatedAt: new Date().toISOString(),
		assets: Array.from(new Set(assetIndexEntries)).sort()
	};
	fs.writeFileSync(assetIndexTarget, JSON.stringify(assetIndex, null, 2));
	console.log(`Wrote asset index to ${assetIndexTarget}`);
    
    console.log('Content loading completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})(); 
