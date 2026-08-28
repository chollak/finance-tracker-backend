import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { QueryProvider } from './app/QueryProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент #root');

createRoot(root).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>
);
