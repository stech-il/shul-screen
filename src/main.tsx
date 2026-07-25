import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { purgeLegacyDesignTemplateStorage } from './lib/designTemplates';
import './index.css';

// Free localStorage quota left by older template saves (before IndexedDB migration).
purgeLegacyDesignTemplateStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
