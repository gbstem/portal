import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'

dotenv.config()

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
})
