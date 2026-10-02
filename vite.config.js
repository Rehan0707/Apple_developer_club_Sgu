import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const pages = ['index.html','events/index.html','join/index.html','resources/index.html','team/index.html','guide/index.html','student/index.html','dashboard/index.html','admin/index.html','admin/login.html','admin/resources.html','admin/registrations.html','admin/badges.html'];
export default defineConfig({server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3001'}},build:{rollupOptions:{input:Object.fromEntries(pages.map((p,i)=>['page'+i,resolve(p)]))}}});
