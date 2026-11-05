import { describe, expect, it } from 'vitest';

import {
  COMMENT_MAX_LENGTH,
  normalizeCommentContent,
  validateCommentContent,
} from './comment-validation';

describe('P4 comment validation', () => {
  it('正常场景去除首尾空白', () => {
    expect(normalizeCommentContent('  需要补充测试。  ')).toBe('需要补充测试。');
    expect(validateCommentContent('  需要补充测试。  ')).toBeNull();
  });

  it('边界场景接受最大长度并拒绝超长内容', () => {
    expect(validateCommentContent('测'.repeat(COMMENT_MAX_LENGTH))).toBeNull();
    expect(validateCommentContent('测'.repeat(COMMENT_MAX_LENGTH + 1))).toBe(
      `评论不能超过 ${COMMENT_MAX_LENGTH} 个字符。`,
    );
  });

  it('失败场景拒绝空评论', () => {
    expect(validateCommentContent('   ')).toBe('请输入评论内容。');
  });
});
