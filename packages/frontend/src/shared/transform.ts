export type Vec3 = { x: number; y: number; z: number }

export function rotateVec3(vector: Vec3, rotation: Vec3): Vec3 {
	const vx = vector.x || 0
	const vy = vector.y || 0
	const vz = vector.z || 0
	if (vx === 0 && vy === 0 && vz === 0) {
		return { x: 0, y: 0, z: 0 }
	}
	const rx = rotation.x || 0
	const ry = rotation.y || 0
	const rz = rotation.z || 0

	const cx = Math.cos(rx)
	const sx = Math.sin(rx)
	const cy = Math.cos(ry)
	const sy = Math.sin(ry)
	const cz = Math.cos(rz)
	const sz = Math.sin(rz)

	// Rz * Ry * Rx
	const m00 = cz * cy
	const m01 = cz * sy * sx - sz * cx
	const m02 = cz * sy * cx + sz * sx
	const m10 = sz * cy
	const m11 = sz * sy * sx + cz * cx
	const m12 = sz * sy * cx - cz * sx
	const m20 = -sy
	const m21 = cy * sx
	const m22 = cy * cx

	return {
		x: m00 * vx + m01 * vy + m02 * vz,
		y: m10 * vx + m11 * vy + m12 * vz,
		z: m20 * vx + m21 * vy + m22 * vz
	}
}
