// P0 脚手架占位文件：由 T-02 在 P0.1 中替换为 React 渲染入口、路由和统一布局。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(
    <StrictMode>
      <main>
        <h1>学生课程项目协作与进度管理系统</h1>
        <p>P0 脚手架占位页面：等待 T-02 接入路由骨架与统一布局。</p>
      </main>
    </StrictMode>,
  );
}
