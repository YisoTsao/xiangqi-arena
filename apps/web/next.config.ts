import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // workspace 套件以 TypeScript 原始碼發佈，由 Next 轉譯
  transpilePackages: [
    '@xiangqi-arena/game-core',
    '@xiangqi-arena/game-match',
    '@xiangqi-arena/game-protocol',
    '@xiangqi-arena/game-renderer',
    '@xiangqi-arena/game-xiangqi',
    '@xiangqi-arena/game-banqi',
    '@xiangqi-arena/shared',
  ],
  poweredByHeader: false,
};

export default nextConfig;
