'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, LogOut, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import {
  kindLabel,
  kindOf,
  sortTiles,
  type MahjongActionInput,
  type MahjongMatchView,
  type Tile,
} from '@xiangqi-arena/games-mahjong';
import { MahjongTile, TileBack, type TileSize } from './MahjongTile';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { useSettings } from '@/lib/settings';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

interface Props {
  view: MahjongMatchView;
  you: number;
  names: string[];
  send: (action: MahjongActionInput) => void;
  onExit: () => void;
  /** 練習模式顯示的標題 */
  title?: string;
}

const WINDS = ['東', '南', '西', '北'];
type Side = 'bottom' | 'right' | 'top' | 'left';
/** 打牌順序 0 → 1 → 2 → 3：下家在右、對家在上、上家在左 */
const SIDES: Side[] = ['bottom', 'right', 'top', 'left'];

const sideOf = (seat: number, you: number): Side => SIDES[(seat - you + 4) % 4]!;

function Melds({
  melds,
  size,
}: {
  melds: MahjongMatchView['players'][number]['melds'];
  size: TileSize;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {melds.map((m, i) => (
        <div
          key={i}
          className="flex gap-px"
          title={m.type === 'kong' ? '槓' : m.type === 'pung' ? '碰' : '吃'}
        >
          {m.tiles.length === 0
            ? [0, 1, 2, 3].map((j) => <TileBack key={j} size={size} />)
            : m.tiles.map((t) => <MahjongTile key={t} tile={t} size={size} />)}
        </div>
      ))}
    </div>
  );
}

function Flowers({ flowers }: { flowers: Tile[] }) {
  if (flowers.length === 0) return null;
  return (
    <div className="flex gap-px" aria-label="花牌">
      {flowers.map((t) => (
        <MahjongTile key={t} tile={t} size="xs" />
      ))}
    </div>
  );
}

function River({ tiles, last }: { tiles: Tile[]; last: Tile | null }) {
  return (
    <div className="grid grid-cols-6 gap-px">
      {tiles.map((t) => (
        <MahjongTile key={t} tile={t} size="xs" highlight={t === last} />
      ))}
    </div>
  );
}

/** 莊家台只算在莊家參與的那一筆：莊家胡、莊家放槍、閒家自摸（莊家那筆） */
const dealerShare = (r: NonNullable<MahjongMatchView['lastHand']>): boolean =>
  r.winner === r.dealer || r.from === null || r.from === r.dealer;

export function MahjongScreen({ view, you, names, send, onExit, title = '麻將練習' }: Props) {
  const { sound, setSound } = useSettings();
  const [selected, setSelected] = useState<Tile | null>(null);
  const [showResult, setShowResult] = useState(true);
  const phase = view.phase;
  const me = view.players[you]!;
  const o = view.options;
  const myTurn = phase.type === 'discard' && phase.seat === you;
  const claiming = phase.type === 'claim' && view.activeSeats.includes(you);
  const hasClaim = claiming && (o.win || o.pung || o.kong || o.chow.length > 0);
  const lastDiscard = phase.type === 'claim' && !phase.robKong ? phase.tile : null;

  // 剛摸的那張放最右邊，其餘排序
  const drawn = phase.type === 'discard' ? phase.drawn : null;
  const hand = useMemo(() => {
    const rest = sortTiles(view.hand.filter((t) => t !== drawn));
    return drawn !== null && view.hand.includes(drawn) ? [...rest, drawn] : rest;
  }, [view.hand, drawn]);

  useEffect(() => setSelected(null), [view.version]);
  useEffect(() => {
    if (phase.type === 'hand-end' || phase.type === 'over') setShowResult(true);
  }, [phase.type, view.handNumber]);

  // 音效
  const lastSeq = useRef(view.history.at(-1)?.seq ?? 0);
  useEffect(() => {
    const last = view.history.at(-1);
    if (!last || last.seq === lastSeq.current) return;
    lastSeq.current = last.seq;
    if (last.notation === '胡' || last.notation === '自摸')
      playSound(last.seat === you ? 'win' : 'lose', sound);
    else if (/^(碰|槓|吃|暗槓|加槓)/.test(last.notation)) playSound('capture', sound);
    else playSound('move', sound);
  }, [view.history, sound, you]);
  useEffect(() => {
    if (myTurn) playSound('notify', sound);
  }, [myTurn, sound]);

  const discard = (tile: Tile) => {
    if (!myTurn) return;
    if (selected === tile) send({ kind: 'discard', tile });
    else {
      playSound('select', sound);
      setSelected(tile);
    }
  };

  const seatPanel = (seat: number) => {
    const p = view.players[seat]!;
    const side = sideOf(seat, you);
    const active = view.activeSeats.includes(seat) && phase.type === 'discard';
    return (
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-2xl border border-ink-700 bg-ink-900/70 p-3',
          active && 'border-gold-400/70 shadow-[0_0_24px_-8px_rgb(227_181_91/0.6)]',
        )}
        data-testid={`mj-seat-${side}`}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="grid size-6 place-items-center rounded-md bg-ink-700 font-serif text-gold-300">
            {WINDS[view.seatWinds[seat]!]}
          </span>
          <span className="truncate font-medium">{names[seat]}</span>
          {view.dealer === seat && (
            <Badge className="bg-cinnabar-500/20 text-cinnabar-400">
              莊{view.streak > 0 ? ` 連${view.streak}` : ''}
            </Badge>
          )}
          <span className="ml-auto tabular-nums text-ink-300">{view.points[seat]}</span>
        </div>
        {seat !== you && (
          <div className="flex flex-wrap gap-px" aria-label={`${p.handCount} 張手牌`}>
            {Array.from({ length: p.handCount }, (_, i) => (
              <TileBack key={i} size="xs" />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Melds melds={p.melds} size="xs" />
          <Flowers flowers={p.flowers} />
        </div>
      </div>
    );
  };

  const at = (side: Side) =>
    [0, 1, 2, 3].map((i) => (you + i) % 4).find((s) => sideOf(s, you) === side)!;
  const result = view.lastHand;
  const handOver = phase.type === 'hand-end' || phase.type === 'over';
  const ready = phase.type === 'hand-end' && phase.ready[you];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:px-5">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onExit} data-testid="mj-exit">
          <LogOut /> 離開
        </Button>
        <div className="font-serif text-lg font-semibold">{title}</div>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-300 sm:text-sm">
          <span>
            {WINDS[view.roundWind]}風圈 · 第 {view.handNumber} 把
          </span>
          <span className="tabular-nums" data-testid="mj-wall">
            牌牆 {view.wallCount}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={sound ? '關閉音效' : '開啟音效'}
            onClick={() => setSound(!sound)}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
        </div>
      </header>

      {/* 桌面：上家、對家、下家與中間的牌河 */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">{seatPanel(at('left'))}</div>
        <div className="order-1 lg:order-2">{seatPanel(at('top'))}</div>
        <div className="order-3">{seatPanel(at('right'))}</div>
      </div>

      <section
        aria-label="牌河"
        className="grid flex-1 grid-cols-2 gap-3 rounded-3xl border border-ink-700 bg-[radial-gradient(ellipse_at_center,#2b5a47_0%,#1d4034_70%,#163228_100%)] p-3 sm:grid-cols-4"
      >
        {(['left', 'top', 'right', 'bottom'] as Side[]).map((side) => {
          const seat = at(side);
          return (
            <div key={side} className="min-w-0">
              <div className="mb-1 text-xs text-[#cfe3d6]/80">{names[seat]}</div>
              <River tiles={view.players[seat]!.discards} last={lastDiscard} />
            </div>
          );
        })}
      </section>

      {/* 自己：面子、花、手牌、動作 */}
      <section
        className={cn(
          'rounded-3xl border border-ink-700 bg-ink-900/80 p-3',
          (myTurn || hasClaim) && 'border-gold-400/60',
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="grid size-7 place-items-center rounded-md bg-ink-700 font-serif text-gold-300">
            {WINDS[view.seatWinds[you]!]}
          </span>
          <span className="font-medium">{names[you]}</span>
          {view.dealer === you && (
            <Badge className="bg-cinnabar-500/20 text-cinnabar-400">
              莊{view.streak > 0 ? ` 連${view.streak}` : ''}
            </Badge>
          )}
          <span className="tabular-nums text-ink-300">{view.points[you]} 分</span>
          <Melds melds={me.melds} size="sm" />
          <Flowers flowers={me.flowers} />
          {view.waits.length > 0 && (
            <span
              className="ml-auto flex items-center gap-1 text-xs text-ink-300"
              data-testid="mj-waits"
            >
              聽
              {view.waits.map((k) => (
                <span key={k} className="rounded bg-ink-800 px-1.5 py-0.5 font-serif text-gold-300">
                  {kindLabel(k)}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-1 overflow-x-auto pb-1" data-testid="mj-hand">
          {hand.map((t, i) => (
            <button
              key={t}
              type="button"
              disabled={!myTurn}
              onClick={() => discard(t)}
              data-testid="mj-hand-tile"
              aria-label={`${kindLabel(kindOf(t))}${selected === t ? '（再按一次打出）' : ''}`}
              className={cn(
                'rounded-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                myTurn && 'hover:-translate-y-1',
                selected === t && '-translate-y-3',
                drawn === t && i === hand.length - 1 && 'ml-3',
              )}
            >
              <MahjongTile tile={t} />
            </button>
          ))}
        </div>

        <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2">
          <span className="text-sm text-ink-300" data-testid="mj-status">
            {myTurn
              ? selected !== null
                ? '再按一次打出這張'
                : '輪到你：點一張牌打出'
              : hasClaim
                ? `${names[(phase as { from: number }).from]} 打出 ${lastDiscard !== null ? kindLabel(kindOf(lastDiscard)) : '加槓'}`
                : phase.type === 'discard'
                  ? `等 ${names[phase.seat]} 打牌`
                  : phase.type === 'claim'
                    ? '等其他人決定'
                    : ''}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {o.win && (myTurn || claiming) && (
              <Button variant="danger" onClick={() => send({ kind: 'win' })} data-testid="mj-win">
                {myTurn ? '自摸' : '胡'}
              </Button>
            )}
            {myTurn &&
              o.selfKong.map((k) => (
                <Button key={k} onClick={() => send({ kind: 'self-kong', tileKind: k })}>
                  槓 {kindLabel(k)}
                </Button>
              ))}
            {myTurn && selected !== null && (
              <Button
                variant="primary"
                onClick={() => send({ kind: 'discard', tile: selected })}
                data-testid="mj-discard"
              >
                打出 {kindLabel(kindOf(selected))}
              </Button>
            )}
            {claiming && o.kong && <Button onClick={() => send({ kind: 'kong' })}>槓</Button>}
            {claiming && o.pung && (
              <Button onClick={() => send({ kind: 'pung' })} data-testid="mj-pung">
                碰
              </Button>
            )}
            {claiming &&
              o.chow.map((pair) => (
                <Button
                  key={pair.join()}
                  onClick={() => send({ kind: 'chow', tiles: pair })}
                  data-testid="mj-chow"
                >
                  吃 {pair.map((t) => kindLabel(kindOf(t))).join('')}
                </Button>
              ))}
            {hasClaim && (
              <Button variant="ghost" onClick={() => send({ kind: 'pass' })} data-testid="mj-pass">
                過
              </Button>
            )}
            {handOver && !showResult && (
              <Button variant="outline" onClick={() => setShowResult(true)}>
                看結算
              </Button>
            )}
          </div>
        </div>
      </section>

      <Dialog
        open={handOver && showResult && result !== null}
        onClose={() => setShowResult(false)}
        title={
          phase.type === 'over'
            ? '整將結束'
            : result?.kind === 'draw'
              ? `第 ${result.hand} 把 · 流局`
              : `第 ${result?.hand ?? ''} 把 · ${result && result.winner !== null ? names[result.winner] : ''} ${result?.from === null ? '自摸' : '胡牌'}`
        }
        className="w-[min(94vw,560px)]"
      >
        {result && (
          <div className="space-y-4" data-testid="mj-result">
            {result.kind === 'win' && result.winner !== null && (
              <>
                {result.from !== null && (
                  <p className="text-sm text-ink-300">{names[result.from]} 放槍</p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-wrap gap-px">
                    {result.hands[result.winner]!.map((t) => (
                      <MahjongTile
                        key={t}
                        tile={t}
                        size="sm"
                        highlight={t === result.winningTile}
                      />
                    ))}
                  </div>
                  <Melds melds={view.players[result.winner]!.melds} size="sm" />
                  <Flowers flowers={view.players[result.winner]!.flowers} />
                </div>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {result.tai
                    .filter((t) => t.tai > 0)
                    .map((t, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{t.label}</span>
                        <span className="tabular-nums text-gold-300">{t.tai} 台</span>
                      </li>
                    ))}
                  {result.dealerTai > 0 && dealerShare(result) && (
                    <li className="flex justify-between text-ink-300">
                      <span>
                        莊家{result.dealerTai > 1 ? '・連莊' : ''}
                        {result.winner !== result.dealer ? `（${names[result.dealer]}那筆）` : ''}
                      </span>
                      <span className="tabular-nums">{result.dealerTai} 台</span>
                    </li>
                  )}
                </ul>
              </>
            )}
            <ul className="divide-y divide-ink-700 rounded-xl border border-ink-700 text-sm">
              {[0, 1, 2, 3].map((seat) => (
                <li key={seat} className="flex items-center gap-2 px-3 py-2">
                  {view.placements?.[seat] === 1 && <Crown className="size-4 text-gold-400" />}
                  <span className={cn(seat === you && 'text-gold-300')}>{names[seat]}</span>
                  {view.placements && (
                    <span className="text-xs text-ink-400">第 {view.placements[seat]} 名</span>
                  )}
                  <span
                    className={cn(
                      'ml-auto tabular-nums',
                      result.deltas[seat]! > 0 && 'text-jade-400',
                      result.deltas[seat]! < 0 && 'text-cinnabar-400',
                    )}
                  >
                    {result.deltas[seat]! > 0 ? '+' : ''}
                    {result.deltas[seat]}
                  </span>
                  <span className="w-14 text-right tabular-nums text-ink-300">
                    {view.points[seat]}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              {phase.type === 'over' ? (
                <>
                  <Button variant="ghost" onClick={onExit}>
                    <LogOut /> 離開
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => send({ kind: 'next' })}
                    data-testid="mj-rematch"
                  >
                    <RotateCcw /> 再來一將
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={ready}
                  onClick={() => send({ kind: 'next' })}
                  data-testid="mj-next"
                >
                  {ready ? '等其他人…' : '下一把'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
