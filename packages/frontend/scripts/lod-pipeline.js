/* eslint-env node */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const DEFAULT_LEVELS = [
	{ suffix: 'lod1', ratio: 0.6, error: 0.06 },
	{ suffix: 'lod2', ratio: 0.35, error: 0.14 },
	{ suffix: 'lod3', ratio: 0.2, error: 0.22 }
];

const MAX_LEVELS = 6;

const isBooleanTrue = (value) => String(value || '').toLowerCase() === 'true';

const isLodModelPath = (filePath) => /\.lod\d+\.glb$/i.test(filePath);

const parseLevels = (raw) => {
	if (!raw || typeof raw !== 'string') {
		return DEFAULT_LEVELS;
	}
	const parsed = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.slice(0, MAX_LEVELS)
		.map((entry, index) => {
			const ratio = Number(entry);
			if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
				return null;
			}
				return {
					suffix: `lod${index + 1}`,
					ratio,
					error: Math.max(0.02, (1 - ratio) * 0.22)
				};
		})
		.filter(Boolean);
	return parsed.length > 0 ? parsed : DEFAULT_LEVELS;
};

const tryStat = (filePath) => {
	try {
		return fs.statSync(filePath);
	} catch {
		return null;
	}
};

const isTargetUpToDate = (targetPath, sourceMtimeMs) => {
	const targetStat = tryStat(targetPath);
	if (!targetStat) return false;
	return targetStat.mtimeMs >= sourceMtimeMs;
};

const buildLodPath = (targetPath, suffix) => targetPath.replace(/\.glb$/i, `.${suffix}.glb`);
const buildLodWebPath = (webPath, suffix) => webPath.replace(/\.glb$/i, `.${suffix}.glb`);

export async function generateLodVariants(modelEntries, options = {}) {
	const levels = parseLevels(options.levelRatios || process.env.VITE_MODEL_LOD_LEVELS);
	const force = options.force === true || isBooleanTrue(process.env.VITE_MODEL_LOD_FORCE);
	const verbose = options.verbose !== false;
	const generatedWebPaths = [];
	if (!Array.isArray(modelEntries) || modelEntries.length === 0) {
		return generatedWebPaths;
	}

	await MeshoptDecoder.ready;
	await MeshoptEncoder.ready;
	const dracoDecoder = await draco3d.createDecoderModule();
	const dracoEncoder = await draco3d.createEncoderModule();

	const io = new NodeIO()
		.registerExtensions([KHRDracoMeshCompression])
		.registerDependencies({
			'draco3d.decoder': dracoDecoder,
			'draco3d.encoder': dracoEncoder,
			'meshopt.decoder': MeshoptDecoder,
			'meshopt.encoder': MeshoptEncoder,
			'meshopt.simplifier': MeshoptSimplifier
		});

	let generated = 0;
	let skippedAnimated = 0;
	let skippedUnsupported = 0;
	let skippedUpToDate = 0;
	let failed = 0;

	for (const entry of modelEntries) {
		if (!entry || typeof entry.targetPath !== 'string' || typeof entry.webPath !== 'string') continue;
		if (path.extname(entry.targetPath).toLowerCase() !== '.glb') {
			skippedUnsupported += 1;
			continue;
		}
		if (isLodModelPath(entry.targetPath)) {
			continue;
		}

		const sourceStat = tryStat(entry.sourcePath) || tryStat(entry.targetPath);
		const sourceMtimeMs = sourceStat?.mtimeMs ?? 0;

		let hasAnimations = false;
		try {
			const sourceDoc = await io.read(entry.targetPath);
			hasAnimations = sourceDoc.getRoot().listAnimations().length > 0;
		} catch (error) {
			failed += levels.length;
			if (verbose) {
				console.warn(`[LOD] failed reading ${entry.targetPath}:`, error?.message || error);
			}
			continue;
		}

		if (hasAnimations) {
			skippedAnimated += levels.length;
			if (verbose) {
				console.info(`[LOD] skipping animated model ${entry.targetPath}`);
			}
			continue;
		}

		for (const level of levels) {
			const lodPath = buildLodPath(entry.targetPath, level.suffix);
			const lodWebPath = buildLodWebPath(entry.webPath, level.suffix);
			if (!force && isTargetUpToDate(lodPath, sourceMtimeMs)) {
				generatedWebPaths.push(lodWebPath);
				skippedUpToDate += 1;
				continue;
			}
			try {
				const doc = await io.read(entry.targetPath);
				await doc.transform(
					weld({ tolerance: 0.0001 }),
						simplify({
							ratio: level.ratio,
							error: level.error,
							lockBorder: false,
							overwrite: true,
							simplifier: MeshoptSimplifier
						}),
					prune(),
					dedup()
				);
				await io.write(lodPath, doc);
				generatedWebPaths.push(lodWebPath);
				generated += 1;
				if (verbose) {
					console.info(`[LOD] generated ${path.basename(lodPath)} (ratio=${level.ratio})`);
				}
			} catch (error) {
				failed += 1;
				if (verbose) {
					console.warn(`[LOD] failed generating ${lodPath}:`, error?.message || error);
				}
			}
		}
	}

	if (verbose) {
		console.info(
			`[LOD] summary generated=${generated} upToDate=${skippedUpToDate} animated=${skippedAnimated} unsupported=${skippedUnsupported} failed=${failed}`
		);
	}

	return Array.from(new Set(generatedWebPaths)).sort();
}
