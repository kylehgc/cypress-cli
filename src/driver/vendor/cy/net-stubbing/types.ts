// Net-stubbing types shim
export interface Route {
	alias?: string;
}
export interface Interception {
	[key: string]: any;
}
export interface RouteMap {
	[key: string]: Route;
}
export default {};
