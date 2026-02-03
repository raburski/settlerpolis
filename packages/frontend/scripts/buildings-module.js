import * as fs from 'node:fs';
import * as path from 'node:path';

function escapeNonAscii(text) {
	let output = '';
	for (let i = 0; i < text.length; i += 1) {
		const codePoint = text.codePointAt(i);
		if (codePoint === undefined) continue;
		if (codePoint <= 0x7f) {
			output += text[i];
			continue;
		}
		if (codePoint <= 0xffff) {
			output += `\\u${codePoint.toString(16).padStart(4, '0')}`;
		} else {
			const adjusted = codePoint - 0x10000;
			const high = 0xd800 + (adjusted >> 10);
			const low = 0xdc00 + (adjusted & 0x3ff);
			output += `\\u${high.toString(16).padStart(4, '0')}`;
			output += `\\u${low.toString(16).padStart(4, '0')}`;
			i += 1;
		}
	}
	return output;
}

export function generateBuildingsModule(contentDir) {
	const buildingsJsonPath = path.join(contentDir, 'buildings.json');
	const buildingsModulePath = path.join(contentDir, 'buildings.generated.ts');

	if (!fs.existsSync(buildingsJsonPath)) {
		console.warn(`Buildings JSON not found at ${buildingsJsonPath}`);
		return { buildingsJsonPath, buildingsModulePath, success: false };
	}

	try {
		const raw = fs.readFileSync(buildingsJsonPath, 'utf8');
		const parsed = JSON.parse(raw);
		const buildings = Array.isArray(parsed)
			? parsed
			: Array.isArray(parsed?.buildings)
				? parsed.buildings
				: null;

		if (!buildings) {
			console.warn('Buildings JSON has unexpected format. Expected array or { buildings: [] }.');
			return { buildingsJsonPath, buildingsModulePath, success: false };
		}

		const json = JSON.stringify(buildings, null, 2);
		const escapedJson = escapeNonAscii(json);
		const contents =
			`// Auto-generated from buildings.json. Do not edit by hand.\n` +
			`import type { BuildingDefinition } from '@rugged/game';\n\n` +
			`export const buildings: BuildingDefinition[] = ${escapedJson};\n`;

		fs.writeFileSync(buildingsModulePath, contents, 'utf8');
		return { buildingsJsonPath, buildingsModulePath, success: true };
	} catch (error) {
		console.error(`Failed to generate buildings module: ${error.message}`);
		return { buildingsJsonPath, buildingsModulePath, success: false };
	}
}
