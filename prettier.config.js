/** @type {import("prettier").Options} */
export default {
  semi: false,
  singleQuote: true,
  plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn'],
  tailwindStylesheet: './src/app.css',
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
}
