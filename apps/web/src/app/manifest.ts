import type { MetadataRoute } from 'next';

// PWA 基礎資訊（離線快取等完整 PWA 功能列於第三階段）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xiangqi Arena 象棋競技場',
    short_name: 'Xiangqi Arena',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1420',
    theme_color: '#0f1420',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
