export const COMMENT_MAX_LENGTH = 2000;

export function normalizeCommentContent(value: string): string {
  return value.trim();
}

export function validateCommentContent(value: string): string | null {
  const content = normalizeCommentContent(value);

  if (!content) {
    return '请输入评论内容。';
  }

  if (content.length > COMMENT_MAX_LENGTH) {
    return `评论不能超过 ${COMMENT_MAX_LENGTH} 个字符。`;
  }

  return null;
}
