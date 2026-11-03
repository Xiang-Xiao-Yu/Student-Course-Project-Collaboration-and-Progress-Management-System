import { useState } from 'react';

import type { ProjectMemberDto } from '../projects/project-api';
import type { RequirementDto } from '../requirements/requirement-api';
import type { TaskFormErrors, TaskFormValues } from './task-validation';

interface TaskFormFieldsProps {
  readonly disabled?: boolean;
  readonly errors: TaskFormErrors;
  readonly members: readonly ProjectMemberDto[];
  readonly onChange: (values: TaskFormValues) => void;
  readonly requirements: readonly RequirementDto[];
  readonly values: TaskFormValues;
}

export function TaskFormFields({
  disabled = false,
  errors,
  members,
  onChange,
  requirements,
  values,
}: TaskFormFieldsProps) {
  const [tagDraft, setTagDraft] = useState('');

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]): void {
    onChange({ ...values, [key]: value });
  }

  function addTag(): void {
    const tag = tagDraft.trim();

    if (!tag) {
      return;
    }

    if (!values.tagNames.includes(tag)) {
      update('tagNames', [...values.tagNames, tag]);
    }

    setTagDraft('');
  }

  function removeTag(tag: string): void {
    update(
      'tagNames',
      values.tagNames.filter((item) => item !== tag),
    );
  }

  return (
    <>
      <label className="form-field">
        <span>任务标题</span>
        <input
          disabled={disabled}
          maxLength={100}
          onChange={(event) => update('title', event.target.value)}
          placeholder="例如：实现任务看板拖拽"
          value={values.title}
        />
        {errors.title ? <small>{errors.title}</small> : null}
      </label>

      <label className="form-field">
        <span>任务描述</span>
        <textarea
          disabled={disabled}
          maxLength={5000}
          onChange={(event) => update('description', event.target.value)}
          rows={3}
          value={values.description}
        />
        {errors.description ? <small>{errors.description}</small> : null}
      </label>

      <div className="project-form-grid">
        <label className="form-field">
          <span>负责人</span>
          <select
            disabled={disabled}
            onChange={(event) => update('assigneeId', event.target.value)}
            value={values.assigneeId}
          >
            <option value="">未分配</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.nickname} (@{member.username})
              </option>
            ))}
          </select>
          {errors.assigneeId ? <small>{errors.assigneeId}</small> : null}
        </label>

        <label className="form-field">
          <span>关联需求</span>
          <select
            disabled={disabled}
            onChange={(event) => update('requirementId', event.target.value)}
            value={values.requirementId}
          >
            <option value="">不关联需求</option>
            {requirements.map((requirement) => (
              <option key={requirement.id} value={requirement.id}>
                {requirement.number} · {requirement.title}
              </option>
            ))}
          </select>
          {errors.requirementId ? <small>{errors.requirementId}</small> : null}
        </label>
      </div>

      <div className="project-form-grid">
        <label className="form-field">
          <span>优先级</span>
          <select
            disabled={disabled}
            onChange={(event) =>
              update(
                'priority',
                event.target.value === 'HIGH'
                  ? 'HIGH'
                  : event.target.value === 'LOW'
                    ? 'LOW'
                    : 'MEDIUM',
              )
            }
            value={values.priority}
          >
            <option value="HIGH">高</option>
            <option value="MEDIUM">中</option>
            <option value="LOW">低</option>
          </select>
          {errors.priority ? <small>{errors.priority}</small> : null}
        </label>

        <label className="form-field">
          <span>截止日期</span>
          <input
            disabled={disabled}
            onChange={(event) => update('dueDate', event.target.value)}
            type="date"
            value={values.dueDate}
          />
          {errors.dueDate ? <small>{errors.dueDate}</small> : null}
        </label>
      </div>

      <div className="project-form-grid">
        <label className="form-field">
          <span>预估工时</span>
          <input
            disabled={disabled}
            inputMode="decimal"
            onChange={(event) => update('estimatedHours', event.target.value)}
            placeholder="例如：4.5"
            value={values.estimatedHours}
          />
          {errors.estimatedHours ? <small>{errors.estimatedHours}</small> : null}
        </label>

        <div className="form-field task-tag-field">
          <span>任务标签</span>
          <div className="task-tag-editor">
            {values.tagNames.length > 0 ? (
              <div className="task-tag-editor__list">
                {values.tagNames.map((tag) => (
                  <span className="task-tag-editor__tag" key={tag}>
                    {tag}
                    <button
                      aria-label={`移除标签 ${tag}`}
                      disabled={disabled}
                      onClick={() => removeTag(tag)}
                      type="button"
                    >
                      移除
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="task-tag-editor__entry">
              <input
                aria-label="新任务标签"
                disabled={disabled}
                maxLength={50}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="输入完整标签，可包含逗号"
                value={tagDraft}
              />
              <button
                className="secondary-button"
                disabled={disabled || !tagDraft.trim()}
                onClick={addTag}
                type="button"
              >
                添加
              </button>
            </div>
          </div>
          {errors.tagNames ? <small>{errors.tagNames}</small> : null}
        </div>
      </div>
    </>
  );
}
