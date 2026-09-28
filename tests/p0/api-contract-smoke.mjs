const DEFAULT_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const REQUEST_TIMEOUT_MS = 5_000;
const rawBaseUrl =
  process.env['P0_API_BASE_URL'] ?? process.env['ELECTRON_API_BASE_URL'] ?? DEFAULT_BASE_URL;
const baseUrl = rawBaseUrl.replace(/\/+$/, '');
const jsonOutput = process.argv.includes('--json');

const results = [];

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidTimestamp(value) {
  return hasString(value) && Number.isFinite(Date.parse(value));
}

function pushResult(id, status, detail) {
  results.push({ id, status, detail });
}

async function request(path) {
  const url = new URL(`${baseUrl}${path}`);
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const contentType = response.headers.get('content-type') ?? '';
  let body;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { url: url.toString(), status: response.status, contentType, durationMs, body };
}

function validateMeta(meta) {
  return (
    meta !== null &&
    typeof meta === 'object' &&
    hasString(meta.requestId) &&
    isValidTimestamp(meta.timestamp)
  );
}

async function checkHealth() {
  const response = await request('/health');
  const body = response.body;
  const success = body !== null && typeof body === 'object' && body.success === true;
  const data = success && body.data !== null && typeof body.data === 'object';
  const meta = success && validateMeta(body.meta);

  if (response.status !== 200) {
    pushResult('P0-API-001', 'failed', `期望 HTTP 200，实际 ${response.status}`);
    return;
  }

  if (response.contentType.toLowerCase().includes('application/json') === false) {
    pushResult('P0-API-001', 'failed', `响应不是 JSON：${response.contentType}`);
    return;
  }

  if (!success || !data || !meta) {
    pushResult('P0-API-001', 'failed', '成功响应缺少 success、data 或安全的 meta 字段');
    return;
  }

  pushResult('P0-API-001', 'passed', `HTTP 200，${response.durationMs}ms`);
}

async function checkErrorContract() {
  const response = await request('/p0-contract-not-found');
  const body = response.body;
  const errorShape =
    body !== null &&
    typeof body === 'object' &&
    body.success === false &&
    body.error !== null &&
    typeof body.error === 'object' &&
    /^[A-Z][A-Z0-9_]*$/.test(body.error.code ?? '') &&
    hasString(body.error.message);
  const meta = errorShape && validateMeta(body.meta);

  if (response.status !== 404) {
    pushResult('P0-API-002', 'failed', `期望 HTTP 404，实际 ${response.status}`);
    return;
  }

  if (!errorShape || !meta) {
    pushResult('P0-API-002', 'failed', '错误响应未满足统一 error 和 meta 契约');
    return;
  }

  pushResult('P0-API-002', 'passed', `HTTP 404，${response.durationMs}ms`);
}

function printHumanResult() {
  console.log(`P0 API 冒烟检查：${baseUrl}`);

  for (const result of results) {
    console.log(`[${result.status.toUpperCase()}] ${result.id} ${result.detail}`);
  }
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return '未知网络错误';
  }

  const cause = error.cause;

  if (cause instanceof Error && cause.message) {
    return `${error.message} (${cause.message})`;
  }

  return error.message;
}

try {
  await checkHealth();
  await checkErrorContract();
} catch (error) {
  pushResult('P0-API-000', 'failed', `无法连接 API：${describeError(error)}`);
}

const failed = results.some((result) => result.status === 'failed');

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        baseUrl,
        checkedAt: new Date().toISOString(),
        passed: !failed,
        results,
      },
      null,
      2,
    ),
  );
} else {
  printHumanResult();
}

if (failed) {
  process.exitCode = 1;
}
