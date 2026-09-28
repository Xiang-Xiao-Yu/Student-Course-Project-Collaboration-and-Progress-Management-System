export interface ProjectSection {
  readonly group: '工作区' | '项目管理';
  readonly path:
    | 'overview'
    | 'requirements'
    | 'board'
    | 'iterations'
    | 'meetings'
    | 'acceptance'
    | 'reports'
    | 'members';
  readonly label: string;
  readonly description: string;
  readonly emptyTitle: string;
}

export const projectSections = [
  {
    group: '工作区',
    path: 'overview',
    label: '项目概览',
    description: '查看项目整体进度和近期动态。',
    emptyTitle: '暂无项目数据',
  },
  {
    group: '工作区',
    path: 'requirements',
    label: '需求管理',
    description: '整理需求、验收标准和任务关联。',
    emptyTitle: '暂无需求记录',
  },
  {
    group: '工作区',
    path: 'board',
    label: '任务看板',
    description: '按状态跟踪任务流转和负责人。',
    emptyTitle: '暂无任务',
  },
  {
    group: '工作区',
    path: 'iterations',
    label: '迭代计划',
    description: '规划迭代目标、周期和任务完成率。',
    emptyTitle: '暂无迭代计划',
  },
  {
    group: '工作区',
    path: 'meetings',
    label: '会议纪要',
    description: '记录会议纪要、决定和行动项。',
    emptyTitle: '暂无会议记录',
  },
  {
    group: '工作区',
    path: 'acceptance',
    label: '阶段验收',
    description: '记录阶段成果、验收结论和整改任务。',
    emptyTitle: '暂无验收记录',
  },
  {
    group: '项目管理',
    path: 'reports',
    label: '统计与导出',
    description: '查看统计图表并导出项目进度。',
    emptyTitle: '暂无统计数据',
  },
  {
    group: '项目管理',
    path: 'members',
    label: '成员管理',
    description: '查看成员角色和任务完成情况。',
    emptyTitle: '暂无成员数据',
  },
] as const satisfies readonly ProjectSection[];

export type ProjectSectionPath = (typeof projectSections)[number]['path'];

export interface NavigationGroup {
  readonly label: string;
  readonly items: readonly ProjectSection[];
}

export const navigationGroups: readonly NavigationGroup[] = (['工作区', '项目管理'] as const).map(
  (group) => ({
    label: group,
    items: projectSections.filter((section) => section.group === group),
  }),
);

export function getProjectSection(path: ProjectSectionPath): ProjectSection {
  const section = projectSections.find((item) => item.path === path);

  if (!section) {
    throw new Error(`Unknown project section: ${path}`);
  }

  return section;
}

export function buildProjectPath(projectId: string, sectionPath: ProjectSectionPath): string {
  const normalizedProjectId = projectId.trim();

  if (!normalizedProjectId) {
    throw new Error('projectId is required');
  }

  return `/projects/${encodeURIComponent(normalizedProjectId)}/${sectionPath}`;
}
