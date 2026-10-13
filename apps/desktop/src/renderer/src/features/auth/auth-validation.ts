export interface LoginFormInput {
  readonly password: string;
  readonly username: string;
}

export interface RegisterFormInput {
  readonly confirmPassword: string;
  readonly nickname: string;
  readonly password: string;
  readonly username: string;
}

export interface AuthFormErrors {
  confirmPassword?: string;
  nickname?: string;
  password?: string;
  username?: string;
}

export function validateLoginForm(input: LoginFormInput): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (!input.username.trim()) {
    errors.username = '请输入用户名。';
  } else if (input.username.trim().length > 64) {
    errors.username = '用户名不能超过 64 个字符。';
  }

  if (!input.password) {
    errors.password = '请输入密码。';
  }

  return errors;
}

export function validateRegisterForm(input: RegisterFormInput): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const username = input.username.trim();
  const nickname = input.nickname.trim();

  if (!username) {
    errors.username = '请输入用户名。';
  } else if (username.length > 64) {
    errors.username = '用户名不能超过 64 个字符。';
  }

  if (!nickname) {
    errors.nickname = '请输入昵称。';
  } else if (nickname.length > 50) {
    errors.nickname = '昵称不能超过 50 个字符。';
  }

  if (input.password.length < 8) {
    errors.password = '密码至少需要 8 个字符。';
  } else if (input.password.length > 128) {
    errors.password = '密码不能超过 128 个字符。';
  }

  if (!input.confirmPassword) {
    errors.confirmPassword = '请再次输入密码。';
  } else if (input.confirmPassword !== input.password) {
    errors.confirmPassword = '两次输入的密码不一致。';
  }

  return errors;
}

export function hasFormErrors(errors: AuthFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}
