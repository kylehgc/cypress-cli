/**
 * Codegen: export recorded commands to Cypress test files.
 */
export { generateTestFile, buildHistory } from './codegen.js';
export type { HistoryEntry, GenerateOptions } from './codegen.js';
export { renderTestFile } from './templateEngine.js';
export type { TemplateOptions } from './templateEngine.js';
