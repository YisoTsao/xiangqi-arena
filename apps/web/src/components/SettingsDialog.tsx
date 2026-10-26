'use client';

import { useEffect, useState } from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Segmented } from './ui/segmented';
import { useSettings, type AnimationSetting, type QualitySetting } from '@/lib/settings';
import { getPlayerName, setPlayerName } from '@/lib/identity';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName(getPlayerName());
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="設定">
      <div className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm text-ink-300">暱稱（下次加入房間時生效）</span>
          <Input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            aria-label="暱稱"
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm text-ink-300">音效</span>
          <Segmented
            ariaLabel="音效"
            value={s.sound ? 'on' : 'off'}
            options={[
              { value: 'on', label: '開啟' },
              { value: 'off', label: '關閉' },
            ]}
            onChange={(v) => s.setSound(v === 'on')}
          />
        </div>
        <div className="space-y-2">
          <span className="text-sm text-ink-300">畫質</span>
          <Segmented<QualitySetting>
            ariaLabel="畫質"
            value={s.quality}
            options={[
              { value: 'auto', label: '自動' },
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' },
              { value: '2d', label: '2D' },
            ]}
            onChange={s.setQuality}
          />
          <p className="text-xs text-ink-400">
            手機建議「自動」或「中」；裝置不支援 WebGL 時會自動切換為 2D 棋盤。
          </p>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-ink-300">動畫</span>
          <Segmented<AnimationSetting>
            ariaLabel="動畫"
            value={s.animation}
            options={[
              { value: 'normal', label: '標準' },
              { value: 'fast', label: '快速' },
              { value: 'off', label: '關閉' },
            ]}
            onChange={s.setAnimation}
          />
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setPlayerName(name);
            onClose();
          }}
        >
          完成
        </Button>
      </div>
    </Dialog>
  );
}
