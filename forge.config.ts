import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    ignore: (file) => {
      if (!file || file === '/node_modules') return false;
      const runtimeModules = ['/node_modules/better-sqlite3', '/node_modules/node-addon-api'];
      return !file.startsWith('/.vite') && !runtimeModules.some((modulePath) => file === modulePath || file.startsWith(`${modulePath}/`));
    },
    appBundleId: 'com.siomai.inventory',
    appCategoryType: 'public.app-category.business',
    darwinDarkModeSupport: true,
    icon: './assets/icon.icns',
    extendInfo: {
      LSMinimumSystemVersion: '13.0.0',
    },
    osxSign: process.env.APPLE_SIGNING_IDENTITY
      ? {
          identity: process.env.APPLE_SIGNING_IDENTITY,
          optionsForFile: () => ({
            hardenedRuntime: true,
            entitlements: './assets/entitlements.mac.plist',
          }),
        }
      : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        background: './assets/dmg-background.png',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
