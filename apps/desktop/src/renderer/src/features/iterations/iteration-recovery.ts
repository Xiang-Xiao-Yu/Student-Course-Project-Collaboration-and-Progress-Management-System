import type { ApiClient } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import type { IterationDetailDto } from './iteration-api';
import { addIterationTask, getIteration } from './iteration-api';

export type IterationTaskAssignmentResult = 'already-assigned' | 'assigned';

function containsTask(iteration: IterationDetailDto, taskId: string): boolean {
  return iteration.tasks.some((task) => task.id === taskId);
}

function isTaskMovedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ITERATION_TASK_MOVED';
}

/**
 * Recovers from a lost add-task response by checking the target iteration before retrying.
 * A 409 can also be caused by another client moving the task between the check and POST.
 */
export async function ensureIterationTaskAssigned(
  api: Pick<ApiClient, 'get' | 'post'>,
  projectId: string,
  iterationId: string,
  taskId: string,
): Promise<IterationTaskAssignmentResult> {
  let iteration = await getIteration(api, projectId, iterationId);

  if (containsTask(iteration, taskId)) {
    return 'already-assigned';
  }

  try {
    await addIterationTask(api, projectId, iterationId, taskId, null);
    return 'assigned';
  } catch (error) {
    if (!isTaskMovedError(error)) {
      throw error;
    }

    iteration = await getIteration(api, projectId, iterationId);

    if (containsTask(iteration, taskId)) {
      return 'already-assigned';
    }

    throw error;
  }
}
