import type { EChartsOption } from 'echarts';

import { getTaskStatusLabel } from '../tasks/task-presentation';
import type {
  DashboardBurndownPoint,
  DashboardCompletionTrendPoint,
  DashboardIterationItem,
  DashboardMemberTaskItem,
  DashboardTaskStatusItem,
} from './dashboard-api';

const axisColor = '#8290a3';
const lineColor = '#dfe5ea';
const textColor = '#526071';

const grid = {
  bottom: 12,
  containLabel: true,
  left: 8,
  right: 18,
  top: 34,
};

export function buildTaskStatusOption(items: readonly DashboardTaskStatusItem[]): EChartsOption {
  return {
    color: ['#98a2b3', '#5b8def', '#2dd4bf', '#f0a13a', '#2563eb', '#d04444'],
    legend: {
      bottom: 0,
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: textColor, fontSize: 11 },
    },
    series: [
      {
        center: ['50%', '43%'],
        data: items.map((item) => ({
          name: getTaskStatusLabel(item.status),
          value: item.count,
        })),
        label: {
          color: textColor,
          fontSize: 11,
          formatter: '{b}: {c}',
        },
        radius: ['42%', '68%'],
        type: 'pie',
      },
    ],
    tooltip: { trigger: 'item' },
  };
}

export function buildMemberTaskOption(members: readonly DashboardMemberTaskItem[]): EChartsOption {
  const maxTasks = Math.max(
    1,
    ...members.flatMap((member) => [
      member.completedTasks,
      member.inProgressTasks,
      member.blockedTasks,
      member.overdueTasks,
    ]),
  );

  return {
    color: ['#2563eb', '#2dd4bf', '#d04444', '#f0a13a'],
    grid: { ...grid, bottom: 24 },
    legend: {
      bottom: 0,
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: textColor, fontSize: 11 },
    },
    series: [
      {
        barMaxWidth: 20,
        data: members.map((member) => member.completedTasks),
        name: '已完成',
        type: 'bar',
      },
      {
        barMaxWidth: 20,
        data: members.map((member) => member.inProgressTasks),
        name: '进行中',
        type: 'bar',
      },
      {
        barMaxWidth: 20,
        data: members.map((member) => member.blockedTasks),
        name: '已阻塞',
        type: 'bar',
      },
      {
        barMaxWidth: 20,
        data: members.map((member) => member.overdueTasks),
        name: '逾期',
        type: 'bar',
      },
    ],
    tooltip: { axisPointer: { type: 'shadow' }, trigger: 'axis' },
    xAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { lineStyle: { color: lineColor } },
      data: members.map((member) => member.nickname),
      type: 'category',
    },
    yAxis: {
      axisLabel: {
        color: axisColor,
        fontSize: 10,
        formatter: (value: number) => (Number.isInteger(value) ? String(value) : ''),
      },
      axisLine: { show: false },
      interval: maxTasks <= 5 ? 1 : undefined,
      max: maxTasks,
      minInterval: 1,
      splitNumber: Math.max(1, Math.min(maxTasks, 4)),
      splitLine: { lineStyle: { color: '#edf0f3' } },
      type: 'value',
    },
  };
}

export function buildIterationOption(iterations: readonly DashboardIterationItem[]): EChartsOption {
  return {
    color: ['#0f766e'],
    grid,
    series: [
      {
        barMaxWidth: 24,
        data: iterations.map((iteration) => Math.round(iteration.completionRate * 10000) / 100),
        label: {
          color: textColor,
          fontSize: 10,
          formatter: '{c}%',
          position: 'right',
        },
        type: 'bar',
      },
    ],
    tooltip: {
      formatter: '{b}<br />完成率：{c}%',
      trigger: 'axis',
    },
    xAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { lineStyle: { color: lineColor } },
      data: iterations.map((iteration) => iteration.name),
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: axisColor, fontSize: 10, formatter: '{value}%' },
      axisLine: { show: false },
      max: 100,
      splitLine: { lineStyle: { color: '#edf0f3' } },
      type: 'value',
    },
  };
}

export function buildCompletionTrendOption(
  trend: readonly DashboardCompletionTrendPoint[],
): EChartsOption {
  return {
    color: ['#2563eb', '#2dd4bf'],
    grid,
    legend: {
      bottom: 0,
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: textColor, fontSize: 11 },
    },
    series: [
      {
        data: trend.map((point) => point.completed),
        lineStyle: { width: 2 },
        name: '当日完成',
        symbolSize: 6,
        type: 'line',
      },
      {
        data: trend.map((point) => point.cumulativeCompleted),
        lineStyle: { width: 2 },
        name: '累计完成',
        symbolSize: 6,
        type: 'line',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { lineStyle: { color: lineColor } },
      boundaryGap: false,
      data: trend.map((point) => point.date.slice(5)),
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { show: false },
      minInterval: 1,
      splitLine: { lineStyle: { color: '#edf0f3' } },
      type: 'value',
    },
  };
}

export function buildBurndownOption(points: readonly DashboardBurndownPoint[]): EChartsOption {
  return {
    color: ['#d04444', '#94a3b8'],
    grid,
    legend: {
      bottom: 0,
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: textColor, fontSize: 11 },
    },
    series: [
      {
        areaStyle: { opacity: 0.08 },
        data: points.map((point) => point.remainingTasks),
        lineStyle: { width: 2 },
        name: '实际剩余',
        symbol: 'none',
        type: 'line',
      },
      {
        data: points.map((point) => point.idealRemainingTasks),
        lineStyle: { type: 'dashed', width: 2 },
        name: '理想剩余',
        symbol: 'none',
        type: 'line',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { lineStyle: { color: lineColor } },
      boundaryGap: false,
      data: points.map((point) => point.date.slice(5)),
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { show: false },
      minInterval: 1,
      splitLine: { lineStyle: { color: '#edf0f3' } },
      type: 'value',
    },
  };
}
