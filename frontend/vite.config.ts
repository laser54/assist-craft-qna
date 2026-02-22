import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    assetsDir: "static",
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Дробим зависимости на мелкие абстрактные чанки, не выдавая имен библиотек
          if (id.includes('node_modules')) {
            // Создаем псевдо-случайный 3-значный хэш из пути, чтобы разбить на 500+ кусков
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
              hash = (hash << 5) - hash + id.charCodeAt(i);
              hash |= 0;
            }
            return 'v' + Math.abs(hash).toString(36).substring(0, 3);
          }
        },
      },
    },
  },
  server: {
    host: "::",
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
