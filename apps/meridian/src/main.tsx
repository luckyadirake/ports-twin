import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@meridian/ui/tokens.css';
import '@meridian/ui/base.css';
import '@meridian/ui/components.css';
import './app.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
