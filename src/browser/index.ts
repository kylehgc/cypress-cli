/**
 * Browser-context helpers: element map, ref tracking, snapshot management,
 * and selector generation.
 */
export {
	ELEMENT_MAP_KEY,
	getElementMap,
	setElementMap,
	resolveRefFromMap,
} from './refMap.js';

export {
	SNAPSHOT_API_KEY,
	IIFE_ENV_KEY,
	type AriaSnapshotApi,
	getSnapshotApi,
	injectSnapshotIife,
	takeSnapshotFromWindow,
} from './snapshotManager.js';

export {
	DEFAULT_SELECTOR_PRIORITY,
	generateSelector,
	buildCypressCommand,
} from './selectorGenerator.js';
