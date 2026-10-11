import { getUserFacingError } from './errors';

export type ApiHealthResult =
  | {
      readonly status: 'ok';
    }
  | {
      readonly message: string;
      readonly status: 'error';
    };

export interface HealthCheckApi {
  get(path: string): Promise<unknown>;
}

export async function checkApiHealth(api: HealthCheckApi): Promise<ApiHealthResult> {
  try {
    await api.get('/health');

    return { status: 'ok' };
  } catch (error) {
    return {
      message: getUserFacingError(error),
      status: 'error',
    };
  }
}
