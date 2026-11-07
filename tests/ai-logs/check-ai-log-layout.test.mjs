import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectLogPaths } from '../../scripts/check-ai-log-layout.mjs';

const validPaths = [
  'docs/ai-logs/README.md',
  'docs/ai-logs/root/2026-11-07.md',
  'docs/ai-logs/codex-backend/2026-11-04.md',
  'docs/ai-logs/deepseek-frontend/2026-11-06.md',
];

test('accepts the three main agent directories and README', () => {
  assert.deepEqual(inspectLogPaths(validPaths), { unexpected: [], missing: [] });
});

test('rejects temporary agent logs and files at the log root', () => {
  const temporary = 'docs/ai-logs/codex-review-p4/2026-11-07.md';
  const standalone = 'docs/ai-logs/review-notes.md';
  assert.deepEqual(inspectLogPaths([...validPaths, temporary, standalone]), {
    unexpected: [temporary, standalone],
    missing: [],
  });
});

test('rejects undated and nested files inside a main agent directory', () => {
  const notes = 'docs/ai-logs/root/notes.md';
  const nested = 'docs/ai-logs/root/archive/2026-11-07.md';
  assert.deepEqual(inspectLogPaths([...validPaths, notes, nested]), {
    unexpected: [notes, nested],
    missing: [],
  });
});

test('reports missing required main directories and README', () => {
  assert.deepEqual(inspectLogPaths(['docs/ai-logs/root/2026-11-07.md']), {
    unexpected: [],
    missing: ['README.md', 'codex-backend', 'deepseek-frontend'],
  });
});
