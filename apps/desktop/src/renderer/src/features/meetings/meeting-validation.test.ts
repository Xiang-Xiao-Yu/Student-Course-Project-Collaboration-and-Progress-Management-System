import { describe, expect, it } from 'vitest';

import type { MeetingDto } from './meeting-api';
import {
  formToCreateMeetingInput,
  hasUnsavedMeetingChanges,
  meetingToForm,
  validateMeetingActionForm,
  validateMeetingForm,
} from './meeting-validation';

const form = {
  agenda: '评审 P5',
  decisions: '',
  minutes: '',
  participantIds: ['user-1'],
  scheduledAt: '2026-11-09T10:00',
  title: 'P5 评审会议',
};

describe('P5 meeting validation', () => {
  it('正常场景接受会议表单并转换时间', () => {
    expect(validateMeetingForm(form, { requireDetails: true })).toEqual({});
    expect(formToCreateMeetingInput(form)).toEqual({
      agenda: '评审 P5',
      participantIds: ['user-1'],
      scheduledAt: new Date('2026-11-09T10:00').toISOString(),
      title: 'P5 评审会议',
    });
  });

  it('边界场景要求会议标题、时间和参会人员', () => {
    const errors = validateMeetingForm(
      { ...form, participantIds: [], scheduledAt: '', title: ' ' },
      { requireDetails: true },
    );

    expect(errors.title).toBe('请输入会议主题。');
    expect(errors.scheduledAt).toBe('请输入有效的会议时间。');
    expect(errors.participantIds).toBe('请至少选择一名参会人员。');
  });

  it('失败场景拒绝空行动项标题并识别会议未保存修改', () => {
    expect(
      validateMeetingActionForm({
        assigneeId: '',
        dueDate: '',
        status: 'PENDING',
        title: '',
      }).title,
    ).toBe('请输入行动项标题。');
    expect(
      validateMeetingActionForm(
        {
          assigneeId: '',
          dueDate: '2026-11-04',
          status: 'PENDING',
          title: '整改',
        },
        '2026-11-05T00:00:00.000Z',
      ).dueDate,
    ).toBe('行动项截止日期不能早于项目开始日期。');
    expect(hasUnsavedMeetingChanges(form, { ...form, agenda: '新议程' })).toBe(true);
  });

  it('边界场景将会议详情转换回表单', () => {
    const meeting = {
      actions: [],
      actionCount: 0,
      agenda: null,
      createdAt: '2026-11-09T00:00:00.000Z',
      createdById: 'user-1',
      decisions: null,
      id: 'meeting-1',
      minutes: null,
      participantCount: 1,
      participants: [
        {
          avatarUrl: null,
          id: 'user-1',
          nickname: '负责人',
          username: 'owner',
        },
      ],
      projectId: 'project-1',
      scheduledAt: new Date('2026-11-09T10:00').toISOString(),
      title: '会议',
      updatedAt: '2026-11-09T00:00:00.000Z',
    } satisfies MeetingDto;

    expect(meetingToForm(meeting).participantIds).toEqual(['user-1']);
  });
});
