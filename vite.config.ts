import { defineConfig } from 'vite'

// Vercel sets VERCEL=1 during build; host root requires absolute "/assets/..." URLs.
// Local/USB builds omit VERCEL → relative "./" for file:// and offline copies.
const base = process.env.VERCEL ? '/' : './'

export default defineConfig({
  base,
})
