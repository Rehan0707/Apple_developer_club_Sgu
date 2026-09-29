import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { rollupOptions: { input: {
    main: resolve('index.html'), events: resolve('events/index.html'), join: resolve('join/index.html'),
    register: resolve('register/index.html'), resources: resolve('resources/index.html'), dashboard: resolve('dashboard/index.html'),
    admin: resolve('admin/index.html'), adminLogin: resolve('admin/login.html'), adminRegistrations: resolve('admin/registrations.html'),
    adminMembers: resolve('admin/members.html'), adminBadges: resolve('admin/badges.html'), adminResources: resolve('admin/resources.html'),
    member: resolve('student/index.html')
  } } }
});
