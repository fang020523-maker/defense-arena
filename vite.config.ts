import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 预优化懒加载依赖：避免运行中才触发依赖优化导致整页 reload、内存态丢失
  optimizeDeps: {
    include: [
      '@xyflow/react',
      'echarts',
      'pdfjs-dist',
      'react-markdown',
      'remark-gfm',
      'framer-motion',
      'zustand',
      'lucide-react',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      // 开发模式下将 /api 转发到本地 Express 代理服务（server/index.mjs）
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
