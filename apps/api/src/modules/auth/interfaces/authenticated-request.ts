import type { RequestWithId } from '../../../common/http/request.types';
import type { SessionUser } from './login-response';

export interface AuthenticatedRequest extends RequestWithId {
  authUser?: SessionUser;
}
