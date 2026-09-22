import type { ProjectSectionPath } from '../app/navigation';
import { getProjectSection } from '../app/navigation';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

interface SectionPageProps {
  readonly section: Exclude<ProjectSectionPath, 'overview'>;
}

export function SectionPage({ section }: SectionPageProps) {
  const definition = getProjectSection(section);

  return (
    <div className="page-stack">
      <PageHeader title={definition.label} description={definition.description} />
      <section className="panel panel--large">
        <EmptyState
          title={definition.emptyTitle}
          description="相关数据产生后，这里会显示完整内容。"
        />
      </section>
    </div>
  );
}
