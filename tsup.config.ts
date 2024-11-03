import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],      // Set the entry point to index.ts
  format: ['cjs', 'esm'],   // CommonJS and ES Module formats
  dts: true,                // Generate declaration files
  clean: true               // Clean output directory before each build
});
