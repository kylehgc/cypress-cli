// Chai internal util shim
export default function getEnumerableProperties(object: object): string[] {
	const result: string[] = [];
	for (const property in object) {
		result.push(property);
	}
	return result;
}
