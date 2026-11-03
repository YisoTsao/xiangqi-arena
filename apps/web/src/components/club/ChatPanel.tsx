'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, MessageCircle, Pencil, Send, Users, X } from 'lucide-react';
import { CLUB_CHAT_MAX, CLUB_NAME_MAX } from '@xiangqi-arena/game-protocol';
import { cn } from '@/lib/utils';
import { useClubNet } from './net';

const STATUS_TEXT = {
  idle: '未連線',
  connecting: '連線中…',
  online: '',
  reconnecting: '重新連線中…',
  offline: '連不上伺服器，稍後自動重試',
} as const;

function time(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 線上人數小標：放在畫面上方的列裡 */
export function OnlineCount() {
  const status = useClubNet((s) => s.status);
  const count = useClubNet((s) => Object.keys(s.players).length);
  const open = useClubNet((s) => s.setChatOpen);
  return (
    <button
      type="button"
      data-testid="club-online"
      data-count={count}
      aria-label={`${count} 人在線，開啟聊天`}
      onClick={() => open(true)}
      className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-[#24344D]/75 px-3 py-1 text-xs whitespace-nowrap text-[#F2DAB6] backdrop-blur hover:bg-[#24344D]"
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'online'
            ? 'bg-emerald-400'
            : status === 'offline'
              ? 'bg-red-400'
              : 'bg-amber-300',
        )}
      />
      <Users className="size-3.5" />
      {status === 'online' ? (
        <>
          {count}
          <span className="hidden sm:inline"> 人在線</span>
        </>
      ) : (
        <span className="hidden sm:inline">{STATUS_TEXT[status]}</span>
      )}
    </button>
  );
}

function NameEditor({ name, onDone }: { name: string; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const rename = useClubNet((s) => s.rename);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        rename(value);
        onDone();
      }}
    >
      <input
        autoFocus
        value={value}
        maxLength={CLUB_NAME_MAX}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        data-testid="club-chat-name-input"
        className="w-28 rounded-md border border-white/20 bg-black/30 px-1.5 py-0.5 text-xs text-[#F2DAB6] outline-none focus:border-[#F2B552]"
      />
    </form>
  );
}

/**
 * 聊天：公開頻道 + 私聊。任何時候都能打開（走路、坐在桌上、標題畫面）。
 * 點名單上的人或訊息上的名字就切到私聊。
 */
export function ChatPanel() {
  const open = useClubNet((s) => s.chatOpen);
  const unread = useClubNet((s) => s.unread);
  const messages = useClubNet((s) => s.messages);
  const players = useClubNet((s) => s.players);
  const you = useClubNet((s) => s.you);
  const target = useClubNet((s) => s.chatTarget);
  const status = useClubNet((s) => s.status);
  const outbox = useClubNet((s) => s.outbox);
  const { setChatOpen, setChatTarget, sendChat } = useClubNet.getState();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const me = you ? players[you] : undefined;
  const others = Object.values(players).filter((p) => p.id !== you);
  const targetPlayer = target ? players[target] : undefined;

  // T 打開聊天並把游標放進輸入框；Esc 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select');
      if (e.code === 'KeyT' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.code === 'Escape' && useClubNet.getState().chatOpen) {
        setChatOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setChatOpen]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, outbox, open]);

  const submit = () => {
    if (sendChat(text)) setText('');
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label="開啟聊天"
        data-testid="club-chat-toggle"
        onClick={() => setChatOpen(true)}
        className="pointer-events-auto fixed top-1/2 right-0 z-50 flex -translate-y-1/2 items-center gap-1 rounded-l-2xl border border-r-0 border-[#F2B552]/40 bg-[#24344D]/90 py-3 pr-2 pl-2.5 text-[#F2DAB6] shadow-xl backdrop-blur hover:bg-[#24344D]"
      >
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span
            data-testid="club-chat-unread"
            className="absolute -top-1.5 -left-1.5 min-w-5 rounded-full bg-[#E95B4B] px-1 text-center text-[11px] leading-5 font-bold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      data-testid="club-chat"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex h-[55dvh] flex-col rounded-t-2xl border border-[#F2B552]/40 bg-[#1b2433]/95 text-sm text-[#F2DAB6] shadow-2xl backdrop-blur sm:inset-x-auto sm:top-1/2 sm:right-3 sm:bottom-auto sm:h-[440px] sm:w-80 sm:-translate-y-1/2 sm:rounded-2xl"
    >
      {/* 標題列：自己的名字（可改）、關閉 */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <MessageCircle className="size-4 shrink-0" />
          <span className="font-bold">聊天</span>
          {me &&
            (editing ? (
              <NameEditor name={me.name} onDone={() => setEditing(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="club-chat-name"
                className="flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[#F2DAB6]/75 hover:bg-white/10"
                title="改名字"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: me.color }} />
                <span className="truncate">{me.name}</span>
                <Pencil className="size-3 shrink-0" />
              </button>
            ))}
        </div>
        <button
          type="button"
          aria-label="關閉聊天"
          data-testid="club-chat-close"
          onClick={() => setChatOpen(false)}
          className="rounded-full p-1 text-[#F2DAB6]/70 hover:text-[#F2DAB6]"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 線上名單：點一下私聊 */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setChatTarget(null)}
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5',
            !target ? 'border-[#F2B552] bg-[#F2B552]/20' : 'border-white/15 hover:bg-white/10',
          )}
        >
          公開
        </button>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid="club-chat-player"
            onClick={() => setChatTarget(p.id)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
              target === p.id
                ? 'border-[#F2B552] bg-[#F2B552]/20'
                : 'border-white/15 hover:bg-white/10',
            )}
          >
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        {others.length === 0 && status === 'online' && (
          <span className="shrink-0 py-0.5 text-[#F2DAB6]/50">目前只有你在館裡</span>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2"
        data-testid="club-chat-list"
      >
        {messages.length === 0 && outbox.length === 0 && (
          <div className="py-6 text-center text-xs text-[#F2DAB6]/50">
            還沒有人說話，打聲招呼吧！
          </div>
        )}
        {messages.map((m) => {
          const mine = m.from === you;
          const whisper = !!m.to;
          const peer = mine ? m.to : m.from;
          return (
            <div
              key={m.id}
              data-testid="club-chat-message"
              data-private={whisper || undefined}
              className={cn(
                'leading-snug break-words',
                whisper && 'rounded-lg bg-[#8552B8]/20 px-2 py-1',
              )}
            >
              <span className="mr-1 text-[10px] text-[#F2DAB6]/40">{time(m.at)}</span>
              {whisper && <Lock className="mr-1 inline size-3 text-[#c9a8f0]" />}
              {m.from === 'system' ? (
                <span className="text-[#F2B552]">{m.text}</span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!peer || !players[peer] || peer === you}
                    onClick={() => peer && setChatTarget(peer)}
                    className="font-bold enabled:hover:underline"
                    style={{ color: mine ? undefined : m.fromColor }}
                  >
                    {mine ? '你' : m.fromName}
                    {whisper && (mine ? ` → ${m.toName}` : ' → 你')}
                  </button>
                  <span className="mx-1 text-[#F2DAB6]/40">:</span>
                  <span>{m.text}</span>
                </>
              )}
            </div>
          );
        })}
        {outbox.map((m) => (
          <div
            key={m.id}
            data-testid="club-chat-pending"
            className={cn(
              'leading-snug break-words opacity-60',
              m.to && 'rounded-lg bg-[#8552B8]/20 px-2 py-1',
            )}
          >
            <span className="mr-1 text-[10px] text-[#F2DAB6]/40">等待連線</span>
            {m.to && <Lock className="mr-1 inline size-3 text-[#c9a8f0]" />}
            <span className="font-bold">你{m.to && ` → ${m.toName}`}</span>
            <span className="mx-1 text-[#F2DAB6]/40">:</span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>

      {status !== 'online' && (
        <div
          data-testid="club-chat-status"
          className="border-t border-white/10 px-3 py-1 text-[11px] text-amber-200/80"
        >
          {status === 'offline' ? '伺服器還沒連上' : STATUS_TEXT[status]}
          ，可以先打字，連上後自動送出
        </div>
      )}

      <form
        className="flex items-center gap-1.5 border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {targetPlayer && (
          <button
            type="button"
            onClick={() => setChatTarget(null)}
            title="改回公開"
            className="flex max-w-[40%] shrink-0 items-center gap-1 rounded-full bg-[#8552B8]/40 px-2 py-1 text-xs"
          >
            <Lock className="size-3 shrink-0" />
            <span className="truncate">{targetPlayer.name}</span>
            <X className="size-3 shrink-0" />
          </button>
        )}
        <input
          ref={inputRef}
          value={text}
          maxLength={CLUB_CHAT_MAX}
          onChange={(e) => setText(e.target.value)}
          // 注音、倉頡選字時按 Enter 是確認選字，不是送出（Safari 選完字的那下 Enter 是 keyCode 229）
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
              e.preventDefault();
            }
          }}
          placeholder={targetPlayer ? `悄悄對 ${targetPlayer.name} 說…` : '對大家說…（Enter 送出）'}
          enterKeyHint="send"
          autoComplete="off"
          data-testid="club-chat-input"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-[#F2DAB6] outline-none placeholder:text-[#F2DAB6]/40 focus:border-[#F2B552] disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="送出"
          disabled={!text.trim()}
          data-testid="club-chat-send"
          className="rounded-xl bg-[#E95B4B] p-2 text-white disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
