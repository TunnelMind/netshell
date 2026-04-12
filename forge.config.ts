import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Native modules must be unpacked from the asar archive to load correctly.
      // Covers: .node (all platforms), .dll (Windows), .dylib (macOS), .so (Linux)
      unpack: '**/*.{node,dll,dylib,so}',
    },
    appId: 'com.netshell.app',
    executableName: 'netshell',
    // Extra files placed outside the asar archive in the app's resources dir.
    // gnmi.proto must be accessible at runtime for @grpc/proto-loader.
    extraResource: ['src/main/gnmi.proto'],
    // icon: './assets/icon', // electron-packager will auto-detect .ico/.icns/.png by platform
  },
  rebuildConfig: {},
  makers: [
    // Windows — Squirrel produces a "NetShell Setup.exe" NSIS-style installer
    new MakerSquirrel({
      name: 'netshell',
      setupExe: 'NetShell-Setup.exe',
    }),
    // macOS — .dmg disk image (conventional Mac distribution format)
    new MakerDMG({
      format: 'ULFO',
    }, ['darwin']),
    // Linux — .deb for Debian/Ubuntu, .rpm for Fedora/RHEL
    new MakerDeb({
      options: {
        maintainer: 'NetShell',
        homepage: 'https://github.com/netshell/netshell',
        depends: ['libsecret-1-0'],  // required by keytar
      },
    }),
    new MakerRpm({
      options: {
        requires: ['libsecret'],     // required by keytar
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
