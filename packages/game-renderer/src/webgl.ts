/** 偵測 WebGL 是否可用（WebGL 2 優先） */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/** 依裝置推薦畫質：觸控小螢幕或低記憶體 → medium/low */
export function recommendedQuality(): 'low' | 'medium' | 'high' {
  if (typeof window === 'undefined') return 'medium';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2) return 'low';
  if (coarse || window.innerWidth < 768) return 'medium';
  return 'high';
}
