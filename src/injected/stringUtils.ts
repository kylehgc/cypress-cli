/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Ported from Playwright (https://github.com/microsoft/playwright)
 * Modified for cypress-cli by [contributors].
 */

// REMOVED: escapeWithQuotes — not needed
// REMOVED: escapeTemplateString — not needed
// REMOVED: isString — not needed
// REMOVED: toTitleCase — not needed
// REMOVED: toSnakeCase — not needed
// REMOVED: formatObject — not needed
// REMOVED: formatObjectOrVoid — not needed
// REMOVED: quoteCSSAttributeValue — not needed

let normalizedWhitespaceCache: Map<string, string> | undefined;

export function cacheNormalizedWhitespaces() {
  normalizedWhitespaceCache = new Map();
}

export function normalizeWhiteSpace(text: string): string {
  let result = normalizedWhitespaceCache?.get(text);
  if (result === undefined) {
    result = text.replace(/[\u200b\u00ad]/g, '').trim().replace(/\s+/g, ' ');
    normalizedWhitespaceCache?.set(text, result);
  }
  return result;
}

// REMOVED: normalizeEscapedRegexQuotes — not needed
// REMOVED: escapeRegexForSelector — not needed
// REMOVED: escapeForTextSelector — not needed
// REMOVED: escapeForAttributeSelector — not needed
// REMOVED: trimString — not needed
// REMOVED: trimStringWithEllipsis — not needed
// REMOVED: escapeRegExp — only used by convertToBestGuessRegex (which is cut)
// REMOVED: escapeHTMLAttribute — not needed
// REMOVED: escapeHTML — not needed
// REMOVED: longestCommonSubstring — only used by textContributesInfo (which is cut)
// REMOVED: parseRegex — not needed
// REMOVED: ansiRegex — not needed
// REMOVED: stripAnsiEscapes — not needed
