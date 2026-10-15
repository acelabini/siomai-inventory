// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Root } from 'react-dom/client';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';

const roots = vi.hoisted(() => [] as Root[]);
// Keep the real React renderer; retain its roots only for test cleanup.
vi.mock('react-dom/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-dom/client')>();
  return { ...original, createRoot: (...args: Parameters<typeof original.createRoot>) => {
    const root = original.createRoot(...args); roots.push(root); return root;
  } };
});

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  // Dexie's connection registry is runtime-only; use it solely to release the
  // real default app database owned by this entry-point integration test.
  const connections = (Dexie as unknown as { connections: Dexie[] }).connections;
  for (const db of connections.filter((db) => db.name === 'siomai-inventory-web')) db.close();
  await Dexie.delete('siomai-inventory-web');
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.unstubAllEnvs();
});

it('holds the real app setup form until the deferred startup worker decision completes', async () => {
  vi.stubEnv('SIOMAI_WEB', 'true');
  document.body.innerHTML = '<div id="root"></div>';
  let resolveRegistration!: (registration: { waiting: null }) => void;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    getRegistration: () => new Promise((resolve) => { resolveRegistration = resolve; }),
  } });
  await act(async () => { await import('../../src/renderer/main'); });
  expect(screen.getByRole('status')).toHaveTextContent('Checking app updates');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await act(async () => { resolveRegistration({ waiting: null }); });
  expect(await screen.findByRole('textbox', { name: /business name/i })).toBeEnabled();
  expect(screen.queryByText('Checking app updates…')).not.toBeInTheDocument();
});
