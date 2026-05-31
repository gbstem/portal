import { sveltekit } from '@sveltejs/kit/vite'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'

dotenv.config()

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [sveltekit()],
})
