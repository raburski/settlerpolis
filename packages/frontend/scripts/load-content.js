#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { spawn } from 'node:child_process';

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
const mapsTargetDir = path.join(frontendDir, 'public/assets/maps');
const npcsTargetDir = path.join(frontendDir, 'public/assets/npcs');
const itemsTargetDir = path.join(frontendDir, 'public/assets/items');

// Create target directories if they don't exist
;[mapsTargetDir, npcsTargetDir, itemsTargetDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

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
    
    console.log('Content loading completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})(); 
