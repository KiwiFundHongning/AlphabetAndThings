import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './app/page';

const root = document.getElementById('root');

if (!root) throw new Error('Missing game root');

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
