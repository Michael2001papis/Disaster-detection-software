import { defineConfig } from 'vite'

// Relative asset paths so `dist/` works from USB, `file://`, or any subpath.
export default defineConfig({
  base: './',
})
