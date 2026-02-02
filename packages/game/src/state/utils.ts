export const mapToEntries = <K, V>(map: Map<K, V>): Array<[K, V]> => Array.from(map.entries())

export const entriesToMap = <K, V>(entries: Array<[K, V]>): Map<K, V> => new Map(entries)

export const setToArray = <T>(set: Set<T>): T[] => Array.from(set.values())

export const arrayToSet = <T>(items: T[]): Set<T> => new Set(items)
