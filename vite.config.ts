/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';
import { defineConfig } from 'vite';

const nodeTests = ['**/*.node.test.{ts,js}'];
const browserTests = ['**/*.test.{ts,js,tsx}', '**/*.browser.test.{ts,js,tsx}'];
const exclude = ['**/node_modules/**', '**/dist/**', '**/build/**'];

export default defineConfig({
  resolve: {
    alias: {
      '##': path.resolve(__dirname, 'src'),
      '\\.css$': path.resolve(__dirname, '__mocks__/styleMock.js'),
      '\\.(jpg|ico|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
        path.resolve(__dirname, '__mocks__/fileMock.js'),
    },
  },
  test: {
    css: false,
    isolate: true,
    globals: true,
    env: {
      NODE_ENV: 'test',
      IS_REACT_ACT_ENVIRONMENT: 'true',
    },

    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTests,
          exclude,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'browser',
          include: browserTests,
          exclude: [...exclude, ...nodeTests],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [
              {
                name: 'react-chromium',
                browser: 'chromium',
              },
            ],
          },
        },
      },
    ],
  },
});
