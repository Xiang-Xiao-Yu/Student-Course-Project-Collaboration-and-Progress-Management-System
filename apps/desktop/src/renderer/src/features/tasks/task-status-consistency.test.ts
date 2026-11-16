import { describe, expect, it } from 'vitest';

import {
  TASK_STATUSES,
  TASK_STATUS_TRANSITIONS,
} from '../../../../../../../packages/shared/src/contracts/status';
import {
  TASK_STATUSES as apiStatuses,
  TASK_STATUS_TRANSITIONS as apiTransitions,
} from '../../../../../../api/src/modules/tasks/task.constants';
import { getTaskStatusTransitions } from './task-presentation';

describe('task status contracts', () => {
  it('keeps API and desktop transitions consistent with the shared contract', () => {
    expect(apiStatuses).toEqual(TASK_STATUSES);
    expect(apiTransitions).toEqual(TASK_STATUS_TRANSITIONS);
    for (const status of TASK_STATUSES) {
      expect(getTaskStatusTransitions(status)).toEqual(TASK_STATUS_TRANSITIONS[status]);
    }
    expect(getTaskStatusTransitions('UNKNOWN')).toEqual([]);
  });
});
