'use client';

import { useRef, useEffect, useMemo } from 'react';

export interface OHLC {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CloseEvent {
  price: number;
  type: 'tp' | 'sl' | 'manual';
  pnl: number;
}

interface CandlestickChartProps {
  candles: OHLC[];
  width?: number;
  height?: number;
  supportLevel?: number;
  resistanceLevel?: number;
  tpLevel?: number | null;
  slLevel?: number | null;
  liqLevel?: number | null;
  entryLevel?: number | null;
  closeEvent?: CloseEvent | null;
  className?: string;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export default function CandlestickChart({
  candles,
  height = 280,
  supportLevel,
  resistanceLevel,
  tpLevel,
  slLevel,
  liqLevel,
  entryLevel,
  closeEvent,
  className = '',
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const displayCandles = useMemo(() => candles.slice(-60), [candles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || displayCandles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Padding
    const padLeft = 8;
    const padRight = 68;
    const padTop = 16;
    const padBottom = 32;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Price range — extend to include TP/SL/entry/liq/closeEvent so reference lines are never clipped
    const allValues = displayCandles.flatMap((c) => [c.high, c.low]);
    const refPrices = [tpLevel, slLevel, liqLevel, entryLevel, closeEvent?.price].filter((v): v is number => v != null && v > 0);
    const minPrice = Math.min(...allValues, ...refPrices);
    const maxPrice = Math.max(...allValues, ...refPrices);
    const range = maxPrice - minPrice || minPrice * 0.01;
    const pricePad = range * 0.08;
    const lo = minPrice - pricePad;
    const hi = maxPrice + pricePad;

    const py = (price: number) => padTop + chartH - ((price - lo) / (hi - lo)) * chartH;
    const n = displayCandles.length;
    const candleW = Math.max(2, Math.floor(chartW / n) - 2);
    const px = (i: number) => padLeft + (i + 0.5) * (chartW / n);

    // Background
    ctx.fillStyle = 'rgba(5, 5, 12, 0)';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let g = 0; g <= gridLines; g++) {
      const yPos = padTop + (g / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();

      // Price label
      const priceVal = hi - (g / gridLines) * (hi - lo);
      ctx.fillStyle = 'rgba(120,120,140,0.8)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`$${fmtPrice(priceVal)}`, w - padRight + 4, yPos + 4);
    }

    // Reference lines
    const drawRefLine = (price: number, color: string, label: string, dashed = true) => {
      if (price < lo || price > hi) return;
      const y = py(price);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, w - padRight + 4, y + 4);
      ctx.restore();
    };

    if (resistanceLevel) drawRefLine(resistanceLevel, 'rgba(255,107,107,0.8)', 'RES');
    if (supportLevel) drawRefLine(supportLevel, 'rgba(74,222,128,0.8)', 'SUP');
    if (tpLevel) drawRefLine(tpLevel, 'rgba(255,184,0,0.9)', 'TP');
    if (slLevel) drawRefLine(slLevel, 'rgba(248,113,113,0.9)', 'SL');
    if (liqLevel) drawRefLine(liqLevel, 'rgba(220,38,38,0.9)', 'LIQ');
    if (entryLevel) drawRefLine(entryLevel, 'rgba(0,255,229,0.8)', 'ENTRY', false);

    // Close-event marker: circle + PnL label on the rightmost candle
    if (closeEvent && closeEvent.price >= lo && closeEvent.price <= hi) {
      const closeY = py(closeEvent.price);
      const closeX = px(n - 1);
      const isProfit = closeEvent.pnl >= 0;
      const markerColor = closeEvent.type === 'tp' ? '#FFB800' : closeEvent.type === 'sl' ? '#f87171' : '#00FFE5';
      const pnlLabel = `${closeEvent.type === 'tp' ? '🎯 TP' : closeEvent.type === 'sl' ? '🛑 SL' : '✕ CLOSE'} ${isProfit ? '+' : ''}$${Math.abs(closeEvent.pnl).toFixed(2)}`;

      // Horizontal dashed line at close price
      ctx.save();
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, closeY);
      ctx.lineTo(w - padRight, closeY);
      ctx.stroke();

      // Circle at close position
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(closeX, closeY, 6, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // PnL label badge
      ctx.font = 'bold 10px monospace';
      const labelW = ctx.measureText(pnlLabel).width + 12;
      const labelX = Math.min(closeX - labelW / 2, w - padRight - labelW);
      const labelY = closeY - 18;
      ctx.fillStyle = isProfit ? 'rgba(74,222,128,0.9)' : 'rgba(248,113,113,0.9)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY - 12, labelW, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.fillText(pnlLabel, labelX + 6, labelY);
      ctx.restore();
    }

    // Candles
    displayCandles.forEach((candle, i) => {
      const x = px(i);
      const openY = py(candle.open);
      const closeY = py(candle.close);
      const highY = py(candle.high);
      const lowY = py(candle.low);
      const bullish = candle.close >= candle.open;
      const color = bullish ? '#4ade80' : '#f87171';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      ctx.fillStyle = bullish ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)';
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);

      // Body border
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
    });

    // X-axis time labels (every ~10 candles)
    ctx.fillStyle = 'rgba(120,120,140,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += step) {
      const candle = displayCandles[i];
      if (!candle) continue;
      const label = new Date(candle.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillText(label, px(i), h - 6);
    }
  }, [displayCandles, height, supportLevel, resistanceLevel, tpLevel, slLevel, liqLevel, entryLevel, closeEvent]);

  return (
    <div ref={containerRef} className={`w-full ${className}`} style={{ height }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
    </div>
  );
}
