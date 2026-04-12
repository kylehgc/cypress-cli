// sessions/storage stub
export const StorageType = {
	localStorage: 'localStorage',
	sessionStorage: 'sessionStorage',
};

export function clearStorage(_state: any, _type?: any) {
	return null;
}

export function getStorage(_state: any, _type?: any) {
	return [];
}

export default { StorageType, clearStorage, getStorage };
