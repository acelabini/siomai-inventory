import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { activatePendingShell } from './pwa-update';

// The standalone web config injects registration as a separate local script.
// Keeping registration out of this shared entry preserves the Electron build.
if (import.meta.env.SIOMAI_WEB === 'true' && 'serviceWorker' in navigator) {
  void activatePendingShell(navigator.serviceWorker, () => window.location.reload())
    .catch(() => { /* Keep the current shell usable if browser update checks fail. */ });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
