// common-tags shim
export function stripIndent(
	strings: TemplateStringsArray,
	...values: any[]
): string {
	let result = '';
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) result += values[i];
	}
	const lines = result.split('\n');
	const minIndent = lines
		.filter((l) => l.trim())
		.reduce(
			(min, l) => Math.min(min, l.match(/^(\s*)/)?.[1].length ?? 0),
			Infinity,
		);
	return lines
		.map((l) => l.slice(minIndent))
		.join('\n')
		.trim();
}

export function stripIndents(
	strings: TemplateStringsArray,
	...values: any[]
): string {
	return stripIndent(strings, ...values);
}

export function oneLine(
	strings: TemplateStringsArray,
	...values: any[]
): string {
	let result = '';
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) result += values[i];
	}
	return result.replace(/\s+/g, ' ').trim();
}

export default { stripIndent, stripIndents, oneLine };
