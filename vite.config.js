import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'admin-route',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/admin' || (path?.startsWith('/admin/') && !path.includes('.'))) req.url = '/admin/index.html';
        next();
      });
    },
  }],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        curriculum: resolve(import.meta.dirname, 'curriculum.html'),
      },
    },
  },
});
