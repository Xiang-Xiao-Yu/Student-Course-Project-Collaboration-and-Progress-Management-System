import type { AcceptanceResult } from './acceptance-api';

const resultLabels: Readonly<Record<AcceptanceResult, string>> = {
  FAILED: '未通过',
  IN_PROGRESS: '验收中',
  NOT_STARTED: '未开始',
  PASSED: '已通过',
};

const resultTransitions: Readonly<Record<AcceptanceResult, readonly AcceptanceResult[]>> = {
  FAILED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PASSED', 'FAILED'],
  NOT_STARTED: ['IN_PROGRESS'],
  PASSED: [],
};

export function getAcceptanceResultLabel(result: AcceptanceResult): string {
  return resultLabels[result];
}

export function getAcceptanceResultTransitions(
  result: AcceptanceResult,
): readonly AcceptanceResult[] {
  return resultTransitions[result];
}

export function canCreateRemediationTask(result: AcceptanceResult): boolean {
  return result === 'FAILED';
}
