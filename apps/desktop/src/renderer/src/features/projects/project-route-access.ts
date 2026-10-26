import type { ProjectDto } from './project-api';

export type ProjectLoadState =
  | { readonly status: 'idle' }
  | { readonly projectId: string; readonly status: 'loading' }
  | { readonly message: string; readonly projectId: string; readonly status: 'error' }
  | { readonly project: ProjectDto; readonly status: 'ready' };

export type ProjectRouteAccessState = 'project-center' | 'loading' | 'ready' | 'error';

export function getProjectRouteAccessState(
  projectId: string | undefined,
  state: ProjectLoadState,
): ProjectRouteAccessState {
  if (!projectId) {
    return 'project-center';
  }

  if (state.status === 'ready' && state.project.id === projectId) {
    return 'ready';
  }

  if (state.status === 'error' && state.projectId === projectId) {
    return 'error';
  }

  return 'loading';
}
