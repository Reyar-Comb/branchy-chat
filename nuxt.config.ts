import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  css: ['katex/dist/katex.min.css', '~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
})
