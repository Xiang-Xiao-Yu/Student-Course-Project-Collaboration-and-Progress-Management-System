import type { FormEvent } from 'react';

import type { IterationSummaryDto } from '../iterations/iteration-api';
import type { ProjectMemberDto } from '../projects/project-api';
import { getTaskPriorityLabel, getTaskStatusLabel, taskStatusColumns } from './task-presentation';
import type { TaskPriority, TaskStatus } from './task-api';
import type { TaskFilterValues } from './task-filters';

interface TaskFilterPanelProps {
  readonly activeFilterCount: number;
  readonly canExport: boolean;
  readonly error: string | null;
  readonly exporting: boolean;
  readonly iterations: readonly IterationSummaryDto[];
  readonly members: readonly ProjectMemberDto[];
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly onExport: () => void;
  readonly onValuesChange: (values: TaskFilterValues) => void;
  readonly taskCount: number;
  readonly values: TaskFilterValues;
}

const priorities: readonly TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

export function TaskFilterPanel({
  activeFilterCount,
  canExport,
  error,
  exporting,
  iterations,
  members,
  onApply,
  onClear,
  onExport,
  onValuesChange,
  taskCount,
  values,
}: TaskFilterPanelProps) {
  function update<Key extends keyof TaskFilterValues>(
    key: Key,
    value: TaskFilterValues[Key],
  ): void {
    onValuesChange({ ...values, [key]: value });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <section className="panel task-filter-panel" aria-labelledby="task-filter-title">
      <div className="panel__header">
        <div>
          <h2 id="task-filter-title">筛选任务</h2>
          <p>筛选条件由服务端组合执行，可与看板状态流配合使用。</p>
        </div>
      </div>

      <form className="task-filter-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>标题搜索</span>
          <input
            maxLength={100}
            onChange={(event) => update('search', event.target.value)}
            placeholder="输入任务标题"
            value={values.search}
          />
        </label>

        <label className="form-field">
          <span>负责人</span>
          <select
            onChange={(event) => update('assigneeId', event.target.value)}
            value={values.assigneeId}
          >
            <option value="">全部成员</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.nickname}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>状态</span>
          <select onChange={(event) => update('status', event.target.value)} value={values.status}>
            <option value="">全部状态</option>
            {taskStatusColumns.map((status: TaskStatus) => (
              <option key={status} value={status}>
                {getTaskStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>优先级</span>
          <select
            onChange={(event) => update('priority', event.target.value)}
            value={values.priority}
          >
            <option value="">全部优先级</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {getTaskPriorityLabel(priority)}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>标签</span>
          <input
            maxLength={50}
            onChange={(event) => update('tag', event.target.value)}
            placeholder="例如 backend"
            value={values.tag}
          />
        </label>

        <label className="form-field">
          <span>迭代</span>
          <select
            onChange={(event) => update('iterationId', event.target.value)}
            value={values.iterationId}
          >
            <option value="">全部迭代</option>
            {iterations.map((iteration) => (
              <option key={iteration.id} value={iteration.id}>
                {iteration.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>截止日期起</span>
          <input
            onChange={(event) => update('dueDateFrom', event.target.value)}
            type="date"
            value={values.dueDateFrom}
          />
        </label>

        <label className="form-field">
          <span>截止日期止</span>
          <input
            onChange={(event) => update('dueDateTo', event.target.value)}
            type="date"
            value={values.dueDateTo}
          />
        </label>

        {error ? (
          <p className="task-filter-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="task-filter-actions">
          <button className="primary-button" type="submit">
            应用筛选
          </button>
          <button className="secondary-button" onClick={onClear} type="button">
            清空筛选
          </button>
          {canExport ? (
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={onExport}
              type="button"
            >
              {exporting ? '正在导出...' : '导出当前结果'}
            </button>
          ) : null}
          <span className="task-filter-summary">
            {activeFilterCount > 0 ? `已启用 ${activeFilterCount} 个筛选条件` : '当前显示全部任务'}
            {' · '}共 {taskCount} 条
          </span>
        </div>
      </form>
    </section>
  );
}
