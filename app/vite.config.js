import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** base: './' 便于 dist 丢到任意子路径（GitHub Pages 等） */
export default defineConfig({
  base: './',
  /** 开发环境 HTTPS：手机 Safari 对 http://局域网IP 往往不弹摄像头，需 https:// */
  plugins: [basicSsl()],
  server: {
    host: true,
  },
});
