/**
 * Element map management and ref resolution.
 *
 * Provides the element map that stores ref→Element mappings produced by
 * the aria snapshot, and a `resolveRef()` function that looks up elements
 * by their ref string.
 */

/** Key used to store the element map on the window object. */
export const ELEMENT_MAP_KEY = '__cypressCliElementMap';

/**
 * Retrieves the element map from the given window object.
 *
 * @param win - The window object to read the element map from
 * @returns The element map, or undefined if not yet populated
 */
export function getElementMap(
	win: Window,
): Map<string, Element> | undefined {
	return (win as unknown as Record<string, unknown>)[ELEMENT_MAP_KEY] as
		| Map<string, Element>
		| undefined;
}

/**
 * Stores the element map on the given window object.
 *
 * Called by `takeSnapshot()` after generating an aria snapshot so that
 * subsequent `resolveRef()` calls can look up elements by ref.
 *
 * @param win - The window object to store the element map on
 * @param elements - The ref→Element map from the aria snapshot
 */
export function setElementMap(
	win: Window,
	elements: Map<string, Element>,
): void {
	(win as unknown as Record<string, unknown>)[ELEMENT_MAP_KEY] = elements;
}

/**
 * Looks up a DOM element by its ref string from the element map stored
 * on the given window object.
 *
 * @param win - The window object containing the element map
 * @param ref - The ref string (e.g. "e5") to look up
 * @returns The DOM element corresponding to the ref
 * @throws Error if the ref is not found in the current snapshot
 */
export function resolveRefFromMap(
	win: Window,
	ref: string,
): Element {
	const elementMap = getElementMap(win);

	if (elementMap) {
		const element = elementMap.get(ref);
		if (element) {
			return element;
		}
	}

	throw new Error(
		`Ref "${ref}" not found in current snapshot. ` +
		'Run `snapshot` to refresh the element map.',
	);
}
