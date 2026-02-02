export interface Serializable<T> {
	serialize(): T
	deserialize(state: T): void
	reset?(): void
}
