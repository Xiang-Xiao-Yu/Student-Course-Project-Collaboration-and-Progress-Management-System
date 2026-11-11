import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([
  BarChart,
  CanvasRenderer,
  GridComponent,
  LegendComponent,
  LineChart,
  PieChart,
  TooltipComponent,
]);

interface DashboardChartProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly option: EChartsOption;
}

export function DashboardChart({ ariaLabel, className = '', option }: DashboardChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = echarts.init(container);
    const resize = () => chart.resize();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());

    chart.setOption(option, { notMerge: true });
    observer?.observe(container);
    globalThis.addEventListener('resize', resize);

    return () => {
      observer?.disconnect();
      globalThis.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [option]);

  return (
    <div
      aria-label={ariaLabel}
      className={`dashboard-chart ${className}`.trim()}
      ref={containerRef}
      role="img"
    />
  );
}
