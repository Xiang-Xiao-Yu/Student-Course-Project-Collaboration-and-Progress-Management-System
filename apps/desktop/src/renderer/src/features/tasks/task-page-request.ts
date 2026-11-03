export interface TaskPageRequest {
  readonly projectId: string;
  readonly taskId: string;
  readonly version: number;
}

export interface ActiveTaskPage {
  readonly projectId: string;
  readonly taskId: string;
  readonly version: number;
}

export function isTaskPageRequestCurrent(
  request: TaskPageRequest,
  activePage: ActiveTaskPage,
): boolean {
  return (
    request.projectId === activePage.projectId &&
    request.taskId === activePage.taskId &&
    request.version === activePage.version
  );
}
