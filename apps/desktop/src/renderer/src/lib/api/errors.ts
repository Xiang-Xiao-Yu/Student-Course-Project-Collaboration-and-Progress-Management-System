export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;

  constructor(options: {
    code: string;
    message: string;
    status?: number | null;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status ?? null;
    this.details = options.details ?? null;
  }
}

const messageByCode: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: '用户名或密码错误。',
  AUTH_SESSION_EXPIRED: '登录状态已失效，请重新登录。',
  AUTH_CURRENT_PASSWORD_INVALID: '当前密码不正确。',
  AUTH_USER_DISABLED: '用户已被禁用，请联系平台管理员。',
  AUTH_USERNAME_TAKEN: '用户名已存在。',
  AVATAR_FILE_TOO_LARGE: '头像图片不能超过 10 MiB。',
  AUTH_FORBIDDEN: '当前账号没有执行此操作的权限。',
  FORBIDDEN: '当前账号没有执行此操作的权限。',
  NETWORK_ERROR: '无法连接到服务，请检查网络后重试。',
  API_INVALID_RESPONSE: '服务响应异常，请稍后重试。',
  PROJECT_ARCHIVED: '已归档项目只读，不能继续修改。',
  PROJECT_DATE_RANGE_INVALID: '项目结束日期不能早于开始日期。',
  PROJECT_DELETE_CONFIRMATION_MISMATCH: '输入的项目名称不匹配，未删除项目。',
  PROJECT_MEMBER_EXISTS: '该用户已经是项目成员。',
  PROJECT_MEMBER_NOT_FOUND: '项目成员不存在。',
  PROJECT_NOT_FOUND: '项目不存在或你无权访问该项目。',
  PROJECT_OWNER_CANNOT_BE_REMOVED: '项目负责人不能被移除，请先转移负责人。',
  PROJECT_OWNER_TRANSFER_CONFLICT: '项目负责人或成员状态已变化，请刷新后重试。',
  PROJECT_OWNER_TRANSFER_REQUIRED: '必须先转移项目负责人后才能修改其角色。',
  PROJECT_PERMISSION_DENIED: '当前账号没有执行此项目操作的权限。',
  PROJECT_STATUS_TRANSITION_INVALID: '当前项目状态不能转换为目标状态。',
  USER_NOT_FOUND: '用户名对应的用户不存在。',
  VALIDATION_FAILED: '提交的数据未通过校验，请检查后重试。',
};

function getMessageByStatus(status: number | null): string {
  switch (status) {
    case 400:
      return '请求参数不正确，请检查后重试。';
    case 401:
      return '登录状态已失效，请重新登录。';
    case 403:
      return '当前账号没有执行此操作的权限。';
    case 404:
      return '请求的数据不存在。';
    case 409:
      return '当前数据已被更新，请刷新后重试。';
    case 422:
      return '提交的数据未通过校验。';
    case 500:
      return '服务暂时不可用，请稍后重试。';
    default:
      return '操作未完成，请稍后重试。';
  }
}

export function getUserFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message.trim()) {
      return error.message;
    }

    return messageByCode[error.code] ?? getMessageByStatus(error.status);
  }

  return getMessageByStatus(null);
}
