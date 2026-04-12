// Config validation shim — no-ops for browser mode
export function validateConfig(_state: any, config: any, _skip?: boolean) {
	return config;
}

export const testOverrideLevels = {};

export type ErrResult = {
	isValid: boolean;
	message?: string;
	key?: string;
};

export function validate(config: any) {
	return config;
}

export function validateOverridableAtRunTime(config: any) {
	return config;
}

export default {
	validateConfig,
	testOverrideLevels,
	validate,
	validateOverridableAtRunTime,
};
