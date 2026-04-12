// Net-stubbing wait-for-route shim
export function waitForRoute(..._args: any[]) {
	return Promise.resolve();
}
export default waitForRoute;
