import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './styles/auth.css';
import './styles/global.css';
import './styles/projects.css';
import './styles/p3.css';
import './styles/p4.css';
import './styles/p5.css';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
