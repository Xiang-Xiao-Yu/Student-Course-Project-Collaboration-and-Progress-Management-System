interface PageHeaderProps {
  readonly title: string;
  readonly description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}
