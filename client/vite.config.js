import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // В Docker на Windows события об изменении файлов не доходят до контейнера,
    // поэтому следим за файлами опросом, иначе страница показывает старый код
    watch: { usePolling: true, interval: 300 },
  },
})
