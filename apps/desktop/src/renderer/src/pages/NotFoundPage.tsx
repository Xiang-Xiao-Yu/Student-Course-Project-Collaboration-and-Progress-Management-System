import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="standalone-state">
      <div className="standalone-state__panel">
        <span className="standalone-state__code">404</span>
        <h1>页面不存在</h1>
        <p>当前地址没有对应的项目页面。</p>
        <Link className="text-link" to="/projects/demo-project/overview">
          返回项目概览
        </Link>
      </div>
    </main>
  );
}
