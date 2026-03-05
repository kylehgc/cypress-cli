declare module '@cypress/unique-selector' {
	interface UniqueSelectorOptions {
		selectorTypes?: string[];
		selectorCache?: Map<Element, string>;
		isUniqueCache?: Map<string, boolean>;
	}

	function unique(element: Element, options?: UniqueSelectorOptions): string;
	export default unique;
}
