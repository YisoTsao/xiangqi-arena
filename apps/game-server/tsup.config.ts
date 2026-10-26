import { defineConfig } from 'tsup';

// 將 workspace 套件打包進單一檔案，部署時只需安裝第三方相依套件
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@xiangqi-arena\//, 'zod'],
});
