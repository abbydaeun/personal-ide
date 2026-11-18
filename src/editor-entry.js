// Bundled by esbuild into renderer/vendor/codemirror.js (global `CM`). Run: npm run build:editor
export { EditorView, keymap, Decoration, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
export { EditorState, StateField, StateEffect, Compartment, RangeSetBuilder } from '@codemirror/state';
export { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
export { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
export { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
export { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
export { tags } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { yaml } from '@codemirror/lang-yaml';

// File extension -> [language label, language support factory]
const L = {
  py: ['Python', () => python()], pyi: ['Python', () => python()],
  md: ['Markdown', () => markdown()], markdown: ['Markdown', () => markdown()], mdx: ['Markdown', () => markdown()],
  js: ['JavaScript', () => javascript()], mjs: ['JavaScript', () => javascript()], cjs: ['JavaScript', () => javascript()],
  jsx: ['JavaScript', () => javascript({ jsx: true })],
  ts: ['TypeScript', () => javascript({ typescript: true })], tsx: ['TypeScript', () => javascript({ typescript: true, jsx: true })],
  json: ['JSON', () => json()], jsonl: ['JSON', () => json()],
  html: ['HTML', () => html()], htm: ['HTML', () => html()], svg: ['SVG', () => html()],
  css: ['CSS', () => css()], scss: ['CSS', () => css()],
  yaml: ['YAML', () => yaml()], yml: ['YAML', () => yaml()],
};
export function languageFor(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const hit = filename.includes('.') ? L[ext] : null;
  return hit ? { name: hit[0], support: hit[1]() } : { name: 'Plain text', support: [] };
}
