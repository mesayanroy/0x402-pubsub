'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────

interface OHLC {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Order {
  id: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price: number;
  status: 'open' | 'filled' | 'cancelled';
  timestamp: string;
  agent?: string;
}

interface Position {
  side: 'long' | 'short';
  entryPrice: number;
  size: number;
  collateral: number;
  leverage: number;
  unrealisedPnl: number;
  liquidationPrice: number;
  tp: number | null;
  sl: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtXLM(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Generates deterministic-looking fake OHLC history. */
function generateHistory(candles = 60): OHLC[] {
  const base = 0.1242;
  let price = base;
  const now = Date.now();
  return Array.from({ length: candles }, (_, i) => {
    const jitter = (Math.random() - 0.48) * 0.004;
    const open = price;
    const close = Math.max(0.05, price + jitter);
    const high = Math.max(open, close) + Math.random() * 0.002;
    const low = Math.min(open, close) - Math.random() * 0.002;
    const volume = 20000 + Math.random() * 80000;
    price = close;
    return {
      ts: new Date(now - (candles - 1 - i) * 60_000).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    };
  });
}

const AGENT_TEMPLATES = [
  {
    id: 'breakout-bot',
    name: 'Breakout Bot',
    description: 'Detects price breakouts above/below Bollinger Bands and enters with tight TP/SL.',
    priceXlm: 0.05,
    tags: ['breakout', 'automated', 'xlm'],
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    description: 'Fades extreme moves back toward the 20-period moving average on XLM/USDC.',
    priceXlm: 0.03,
    tags: ['reversion', 'xlm', 'dca'],
  },
  {
    id: 'trend-follower',
    name: 'Trend Follower',
    description: 'Rides established trends using EMA crossovers and trailing stop-loss on Stellar.',
    priceXlm: 0.07,
    tags: ['trend', 'ema', 'automated'],
  },
  {
    id: 'arbitrage-sentinel',
    name: 'Arbitrage Sentinel',
    description: 'Monitors XLM price across Stellar DEX pools for arb opportunities.',
    priceXlm: 0.1,
    tags: ['arb', 'dex', 'defi'],
  },
];

// ── Main Component ─────────────────────────────────────────────────────────

export default function TradingPage() {
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [candles, setCandles] = useState<OHLC[]>(() => generateHistory(60));
  const [currentPrice, setCurrentPrice] = useState<number>(candles[candles.length - 1].close);
  const [priceChange24h, setPriceChange24h] = useState<number>(3.21);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [orderAmount, setOrderAmount] = useState('100');
  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [collateral, setCollateral] = useState('50');
  const [orders, setOrders] = useState<Order[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'agents'>('chart');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [tvl] = useState(1_247_832);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate live price ticks
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setCurrentPrice((prev) => {
        const delta = (Math.random() - 0.49) * 0.0008;
        const next = Math.max(0.05, prev + delta);
        const change = ((next - 0.1242) / 0.1242) * 100;
        setPriceChange24h(parseFloat(change.toFixed(2)));

        setCandles((prev) => {
          const last = prev[prev.length - 1];
          const updated: OHLC = {
            ...last,
            close: next,
            high: Math.max(last.high, next),
            low: Math.min(last.low, next),
            volume: last.volume + Math.random() * 500,
          };
          return [...prev.slice(0, -1), updated];
        });

        // Update unrealised PnL on open position
        setPosition((pos) => {
          if (!pos) return pos;
          const pnl =
            pos.side === 'long'
              ? (next - pos.entryPrice) * pos.size
              : (pos.entryPrice - next) * pos.size;
          return { ...pos, unrealisedPnl: pnl };
        });

        return next;
      });
    }, 1500);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  // Compute breakout reference lines from last 20 candles
  const recentHigh = Math.max(...candles.slice(-20).map((c) => c.high));
  const recentLow = Math.min(...candles.slice(-20).map((c) => c.low));

  const submitOrder = useCallback(() => {
    setOrderError(null);
    setOrderSuccess(null);

    const amt = parseFloat(orderAmount);
    const col = parseFloat(collateral);
    if (!amt || amt <= 0) { setOrderError('Enter a valid amount.'); return; }
    if (!col || col <= 0) { setOrderError('Enter valid collateral.'); return; }
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setOrderError('Enter a valid limit price.');
      return;
    }

    const price = orderType === 'market' ? currentPrice : parseFloat(limitPrice);
    const tp = tpPrice ? parseFloat(tpPrice) : null;
    const sl = slPrice ? parseFloat(slPrice) : null;

    const newOrder: Order = {
      id: Math.random().toString(36).slice(2, 10).toUpperCase(),
      side: orderSide,
      type: orderType,
      amount: amt,
      price,
      status: orderType === 'market' ? 'filled' : 'open',
      timestamp: new Date().toISOString(),
      agent: selectedAgent || undefined,
    };

    setOrders((prev) => [newOrder, ...prev.slice(0, 19)]);

    if (orderType === 'market') {
      // Liquidation price = entry ± (collateral / (size × leverage))
      // For longs  the price must fall by that offset to wipe the collateral;
      // for shorts it must rise by the same offset.
      const liqOffset = col / (amt * leverage) * (orderSide === 'buy' ? -1 : 1);
      setPosition({
        side: orderSide === 'buy' ? 'long' : 'short',
        entryPrice: price,
        size: amt,
        collateral: col,
        leverage,
        unrealisedPnl: 0,
        liquidationPrice: price + liqOffset,
        tp,
        sl,
      });
      setOrderSuccess(`Market ${orderSide.toUpperCase()} filled @ ${fmtXLM(price)} XLM`);
    } else {
      setOrderSuccess(`Limit order placed @ ${fmtXLM(price)} XLM`);
    }
  }, [orderAmount, orderSide, orderType, limitPrice, tpPrice, slPrice, leverage, collateral, currentPrice, selectedAgent]);

  const closePosition = () => {
    if (!position) return;
    const pnlStr = position.unrealisedPnl >= 0
      ? `+${fmtXLM(position.unrealisedPnl)} XLM`
      : `${fmtXLM(position.unrealisedPnl)} XLM`;
    setOrderSuccess(`Position closed. PnL: ${pnlStr}`);
    setPosition(null);
  };

  const priceFmt = fmtXLM(currentPrice);
  const isUp = priceChange24h >= 0;

  const chartData = candles.slice(-40).map((c) => ({
    ts: c.ts,
    price: c.close,
    high: c.high,
    low: c.low,
    volume: c.volume,
  }));

  return (
    <div className="min-h-screen">
      <div className="max-w-[1440px] mx-auto px-4 py-6 space-y-4">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-syne text-2xl font-bold text-white">XLM / USDC</h1>
              <div className="font-mono text-xs text-gray-500">Stellar {network === 'testnet' ? 'Testnet' : 'Mainnet'} · DEX</div>
            </div>
            <div>
              <div className="font-mono text-3xl font-bold text-white">${priceFmt}</div>
              <div className={`font-mono text-sm ${isUp ? 'text-[#4ade80]' : 'text-red-400'}`}>
                {isUp ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}% (24h)
              </div>
            </div>
            <div className="hidden md:flex gap-6 font-mono text-xs text-gray-500 border-l border-white/10 pl-4">
              <div><div className="text-gray-600">24h High</div><div className="text-white">{fmtXLM(recentHigh)}</div></div>
              <div><div className="text-gray-600">24h Low</div><div className="text-white">{fmtXLM(recentLow)}</div></div>
              <div><div className="text-gray-600">TVL</div><div className="text-[#00FFE5]">${(tvl / 1e6).toFixed(2)}M</div></div>
            </div>
          </div>

          {/* Network toggle */}
          <div className="flex items-center gap-2">
            {(['testnet', 'mainnet'] as const).map((n) => (
              <button
                key={n}
                onClick={() => setNetwork(n)}
                className={`px-4 py-1.5 text-xs font-mono rounded-full border transition-all ${
                  network === n
                    ? n === 'mainnet'
                      ? 'border-[#4ade80] text-[#4ade80] bg-[rgba(74,222,128,0.1)]'
                      : 'border-[#00FFE5] text-[#00FFE5] bg-[rgba(0,255,229,0.08)]'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                {n === 'mainnet' ? '🟢 Mainnet' : '🔵 Testnet'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-white/[0.06] pb-0">
          {(['chart', 'agents'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-xs font-mono border-b-2 transition-all -mb-px ${
                activeTab === t
                  ? 'border-[#00FFE5] text-[#00FFE5]'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'chart' ? '📈 Live Chart' : '🤖 Agent SDK Templates'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'chart' && (
            <motion.div
              key="chart"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"
            >
              {/* Left: Chart + Position */}
              <div className="space-y-4">
                {/* Price Chart */}
                <div className="rounded-2xl border border-white/[0.07] bg-[rgba(5,5,12,0.85)] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#00FFE5] animate-pulse" />
                      <span className="font-mono text-xs text-white/70">Live · 1m candles</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-white/40">
                      <span className="text-[#FF6B6B]">— Resistance {fmtXLM(recentHigh)}</span>
                      <span className="text-[#4ade80]">— Support {fmtXLM(recentLow)}</span>
                    </div>
                  </div>

                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00FFE5" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#00FFE5" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="ts"
                          tick={{ fill: '#555', fontSize: 9 }}
                          tickFormatter={(v: string) =>
                            new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                          }
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fill: '#555', fontSize: 9 }}
                          tickFormatter={(v: number) => v.toFixed(4)}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff' }}
                          labelFormatter={(l) => new Date(String(l)).toLocaleTimeString([], { hour12: false })}
                          formatter={(v: unknown) => [(v as number).toFixed(6), 'Price']}
                        />
                        {/* Breakout / resistance line */}
                        <ReferenceLine y={recentHigh} stroke="#FF6B6B" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: 'Resistance', fill: '#FF6B6B', fontSize: 9 }} />
                        {/* Support line */}
                        <ReferenceLine y={recentLow} stroke="#4ade80" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: 'Support', fill: '#4ade80', fontSize: 9 }} />
                        {/* TP line */}
                        {position?.tp && (
                          <ReferenceLine y={position.tp} stroke="#FFB800" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'TP', fill: '#FFB800', fontSize: 9 }} />
                        )}
                        {/* SL line */}
                        {position?.sl && (
                          <ReferenceLine y={position.sl} stroke="#f87171" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'SL', fill: '#f87171', fontSize: 9 }} />
                        )}
                        {/* Liquidation line */}
                        {position && (
                          <ReferenceLine y={position.liquidationPrice} stroke="#dc2626" strokeWidth={1} strokeDasharray="2 4" label={{ value: 'LIQ', fill: '#dc2626', fontSize: 9 }} />
                        )}
                        <Area type="monotone" dataKey="price" stroke="#00FFE5" fill="url(#priceGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Open Position */}
                {position ? (
                  <div className="rounded-2xl border border-[rgba(0,255,229,0.18)] bg-[rgba(0,255,229,0.03)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-syne text-sm font-bold text-white">Open Position</h3>
                      <button
                        onClick={closePosition}
                        className="px-3 py-1 text-xs font-mono border border-red-700 text-red-400 rounded hover:bg-red-900/30 transition-all"
                      >
                        Close Position
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                      {[
                        { label: 'Side', value: position.side.toUpperCase(), color: position.side === 'long' ? 'text-[#4ade80]' : 'text-red-400' },
                        { label: 'Entry', value: fmtXLM(position.entryPrice), color: 'text-white' },
                        { label: 'Size', value: `${fmtXLM(position.size)} XLM`, color: 'text-white' },
                        { label: 'Leverage', value: `${position.leverage}×`, color: 'text-[#FFB800]' },
                        { label: 'Collateral', value: `${fmtXLM(position.collateral)} XLM`, color: 'text-white' },
                        { label: 'Unrealised PnL', value: `${position.unrealisedPnl >= 0 ? '+' : ''}${fmtXLM(position.unrealisedPnl)} XLM`, color: position.unrealisedPnl >= 0 ? 'text-[#4ade80]' : 'text-red-400' },
                        { label: 'TP', value: position.tp ? fmtXLM(position.tp) : '—', color: 'text-[#FFB800]' },
                        { label: 'SL', value: position.sl ? fmtXLM(position.sl) : '—', color: 'text-red-400' },
                      ].map((s) => (
                        <div key={s.label} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                          <div className="text-gray-500 mb-1">{s.label}</div>
                          <div className={s.color}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4 text-center font-mono text-xs text-white/30">
                    No open position · Place a market order to open
                  </div>
                )}

                {/* Order History */}
                <div className="rounded-2xl border border-white/[0.07] bg-[rgba(5,5,12,0.85)] p-5">
                  <h3 className="font-syne text-sm font-bold text-white mb-3">Order History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] font-mono text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-left text-gray-600">
                          <th className="py-1.5 pr-3">ID</th>
                          <th className="py-1.5 pr-3">Side</th>
                          <th className="py-1.5 pr-3">Type</th>
                          <th className="py-1.5 pr-3">Amount</th>
                          <th className="py-1.5 pr-3">Price</th>
                          <th className="py-1.5 pr-3">Status</th>
                          <th className="py-1.5">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.length === 0 ? (
                          <tr><td colSpan={7} className="py-4 text-center text-white/30">No orders yet</td></tr>
                        ) : (
                          orders.map((o) => (
                            <tr key={o.id} className="border-b border-white/[0.03]">
                              <td className="py-1.5 pr-3 text-white/60">{o.id}</td>
                              <td className={`py-1.5 pr-3 ${o.side === 'buy' ? 'text-[#4ade80]' : 'text-red-400'}`}>{o.side.toUpperCase()}</td>
                              <td className="py-1.5 pr-3 text-white/60">{o.type}</td>
                              <td className="py-1.5 pr-3 text-white">{fmtXLM(o.amount)}</td>
                              <td className="py-1.5 pr-3 text-[#FFB800]">{fmtXLM(o.price)}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] border ${
                                  o.status === 'filled' ? 'bg-[rgba(74,222,128,0.1)] border-green-800 text-[#4ade80]'
                                  : o.status === 'open' ? 'bg-[rgba(0,255,229,0.08)] border-[rgba(0,255,229,0.3)] text-[#00FFE5]'
                                  : 'bg-red-900/20 border-red-900 text-red-400'
                                }`}>{o.status}</span>
                              </td>
                              <td className="py-1.5 text-white/40">{new Date(o.timestamp).toLocaleTimeString([], { hour12: false })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right: Order panel */}
              <div className="space-y-4">
                {/* TVL card */}
                <div className="rounded-2xl border border-[rgba(0,255,229,0.12)] bg-[rgba(0,255,229,0.03)] p-4">
                  <div className="font-mono text-[10px] text-gray-500 mb-1">Total Value Locked (Stellar DEX)</div>
                  <div className="font-syne text-2xl font-bold text-[#00FFE5]">${fmtUSD(tvl)}</div>
                  <div className="font-mono text-xs text-gray-500 mt-1">XLM / USDC Pool · {network}</div>
                </div>

                {/* Buy/Sell toggle */}
                <div className="rounded-2xl border border-white/[0.07] bg-[rgba(5,5,12,0.85)] p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/[0.04]">
                    <button
                      onClick={() => setOrderSide('buy')}
                      className={`py-2 text-xs font-mono rounded-md font-bold transition-all ${
                        orderSide === 'buy' ? 'bg-[#4ade80] text-black' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      Buy / Long
                    </button>
                    <button
                      onClick={() => setOrderSide('sell')}
                      className={`py-2 text-xs font-mono rounded-md font-bold transition-all ${
                        orderSide === 'sell' ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      Sell / Short
                    </button>
                  </div>

                  {/* Market / Limit */}
                  <div className="grid grid-cols-2 gap-2">
                    {(['market', 'limit'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setOrderType(t)}
                        className={`py-1.5 text-xs font-mono rounded border transition-all ${
                          orderType === t
                            ? 'border-[#00FFE5] text-[#00FFE5] bg-[rgba(0,255,229,0.08)]'
                            : 'border-white/10 text-gray-500'
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-mono text-gray-500 mb-1">Amount (XLM)</label>
                    <input
                      value={orderAmount}
                      onChange={(e) => setOrderAmount(e.target.value)}
                      type="number"
                      min="1"
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                    />
                  </div>

                  {/* Limit price */}
                  {orderType === 'limit' && (
                    <div>
                      <label className="block text-[10px] font-mono text-gray-500 mb-1">Limit Price</label>
                      <input
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        type="number"
                        placeholder={priceFmt}
                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                      />
                    </div>
                  )}

                  {/* Collateral */}
                  <div>
                    <label className="block text-[10px] font-mono text-gray-500 mb-1">Collateral (XLM)</label>
                    <input
                      value={collateral}
                      onChange={(e) => setCollateral(e.target.value)}
                      type="number"
                      min="1"
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                    />
                  </div>

                  {/* Leverage */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-1">
                      <span>Leverage</span><span className="text-[#FFB800]">{leverage}×</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={leverage}
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      className="w-full accent-[#FFB800]"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-gray-600 mt-0.5">
                      <span>1×</span><span>5×</span><span>10×</span>
                    </div>
                  </div>

                  {/* TP / SL */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono text-[#FFB800] mb-1">Take Profit</label>
                      <input
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        type="number"
                        placeholder="0.0000"
                        className="w-full px-2 py-1.5 bg-white/[0.03] border border-[rgba(255,184,0,0.2)] rounded text-white text-xs font-mono focus:outline-none focus:border-[rgba(255,184,0,0.5)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-red-400 mb-1">Stop Loss</label>
                      <input
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        type="number"
                        placeholder="0.0000"
                        className="w-full px-2 py-1.5 bg-white/[0.03] border border-red-900/40 rounded text-white text-xs font-mono focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  {/* Agent selector */}
                  <div>
                    <label className="block text-[10px] font-mono text-gray-500 mb-1">Run via Agent (optional)</label>
                    <select
                      value={selectedAgent || ''}
                      onChange={(e) => setSelectedAgent(e.target.value || null)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-xs font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                    >
                      <option value="">Manual (no agent)</option>
                      {AGENT_TEMPLATES.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    {selectedAgent && (
                      <div className="mt-1.5 font-mono text-[9px] text-gray-500">
                        +{AGENT_TEMPLATES.find((a) => a.id === selectedAgent)?.priceXlm} XLM agent fee · 0x402
                      </div>
                    )}
                  </div>

                  {/* Errors / success */}
                  <AnimatePresence>
                    {orderError && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="p-2.5 rounded bg-red-900/20 border border-red-900 text-red-400 text-xs font-mono">
                        {orderError}
                      </motion.div>
                    )}
                    {orderSuccess && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="p-2.5 rounded bg-[rgba(74,222,128,0.08)] border border-green-800 text-[#4ade80] text-xs font-mono">
                        ✓ {orderSuccess}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={submitOrder}
                    className={`w-full py-3 font-mono text-sm rounded-lg font-bold transition-all ${
                      orderSide === 'buy'
                        ? 'bg-[#4ade80] text-black hover:bg-[#22c55e]'
                        : 'bg-red-500 text-white hover:bg-red-600'
                    }`}
                  >
                    {orderSide === 'buy' ? '▲ Buy / Long' : '▼ Sell / Short'} {leverage > 1 ? `(${leverage}×)` : ''}
                  </button>

                  <div className="font-mono text-[9px] text-gray-600 text-center">
                    {network === 'testnet' ? '⚠ Testnet — no real funds' : '🌐 Mainnet — real XLM'} · Stellar Horizon
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <p className="font-mono text-sm text-gray-400">
                Select an agent SDK template to automate your trading strategy. Each call is metered via the 0x402 protocol and costs a small XLM fee.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {AGENT_TEMPLATES.map((agent) => (
                  <motion.div
                    key={agent.id}
                    whileHover={{ y: -4, boxShadow: '0 0 24px rgba(0,255,229,0.08)' }}
                    className="rounded-xl border border-[rgba(0,255,229,0.12)] bg-[rgba(255,255,255,0.03)] p-5 flex flex-col gap-3"
                  >
                    <div>
                      <h3 className="font-syne font-bold text-white">{agent.name}</h3>
                      <p className="text-gray-400 text-xs mt-1">{agent.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.tags.map((t) => (
                        <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(0,255,229,0.06)] text-[#00FFE5] border border-[rgba(0,255,229,0.15)]">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="font-mono text-xs text-[#FFB800]">{agent.priceXlm} XLM/req</span>
                      <button
                        onClick={() => { setSelectedAgent(agent.id); setActiveTab('chart'); }}
                        className="px-3 py-1 text-xs font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all"
                      >
                        Use Template
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* SDK snippet */}
              <div className="rounded-2xl border border-white/[0.07] bg-[rgba(5,5,12,0.85)] p-5">
                <h3 className="font-syne text-sm font-bold text-white mb-3">SDK Quick-Start (0x402)</h3>
                <pre className="font-mono text-xs text-[#00FFE5] overflow-x-auto whitespace-pre-wrap leading-relaxed">{`// Install: npm install @stellar/stellar-sdk ably

const agentId  = '${selectedAgent ?? AGENT_TEMPLATES[0].id}';
const endpoint = \`https://agentforge.dev/api/agents/\${agentId}/run\`;

// 1. Request the agent (will return 402 if price_xlm > 0)
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'Analyse XLM/USDC breakout now' }),
});

if (res.status === 402) {
  const { payment_details } = await res.json();
  // 2. Sign & submit XLM payment via Freighter
  const txHash = await signAndSubmit(payment_details);
  // 3. Retry with payment proof
  const paid = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Tx-Hash': txHash,
      'X-Payment-Wallet': myWallet,
    },
    body: JSON.stringify({ input: 'Analyse XLM/USDC breakout now' }),
  });
  const { output } = await paid.json();
  console.log(output);
}`}</pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
