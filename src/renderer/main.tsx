import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapWebRenderer } from './pwa-update';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element is missing');
}

function renderApp() {
  createRoot(rootElement!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Only the standalone web build gates interaction on its startup update check.
// The separate local registration script and strict CSP remain unchanged.
if (import.meta.env.SIOMAI_WEB === 'true' && 'serviceWorker' in navigator) {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Checking app updates…';
  rootElement.append(status);
  void bootstrapWebRenderer(navigator.serviceWorker, renderApp, () => window.location.reload());
} else {
  renderApp();
}
