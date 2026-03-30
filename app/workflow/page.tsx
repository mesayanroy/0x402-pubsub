'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'pen' | 'eraser' | 'text' | 'rect' | 'circle' | 'triangle' | 'select';

interface DrawElement {
  id: string;
  tool: Tool;
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  strokeWidth: number;
}

interface Task {
  id: string;
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  output?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Canvas Drawing ───────────────────────────────────────────────────────────

function DrawingCanvas({
  elements,
  onAdd,
  activeTool,
  activeColor,
  strokeWidth,
}: {
  elements: DrawElement[];
  onAdd: (el: DrawElement) => void;
  activeTool: Tool;
  activeColor: string;
  strokeWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const currentEl = useRef<DrawElement | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const el of elements) {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.tool === 'pen' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
        ctx.stroke();
      } else if (el.tool === 'eraser' && el.points && el.points.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
        ctx.stroke();
        ctx.restore();
      } else if (el.tool === 'rect' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      } else if (el.tool === 'circle' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.beginPath();
        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.tool === 'triangle' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.beginPath();
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.lineTo(el.x, el.y + el.h);
        ctx.closePath();
        ctx.stroke();
      } else if (el.tool === 'text' && el.text && el.x != null && el.y != null) {
        ctx.fillStyle = el.color;
        ctx.font = `${el.strokeWidth * 6 + 10}px monospace`;
        ctx.fillText(el.text, el.x, el.y);
      }
    }

    if (currentEl.current) {
      const el = currentEl.current;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      if (el.tool === 'pen' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
        ctx.stroke();
      } else if (el.tool === 'rect' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      } else if (el.tool === 'circle' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.beginPath();
        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.tool === 'triangle' && el.x != null && el.y != null && el.w != null && el.h != null) {
        ctx.beginPath();
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.lineTo(el.x, el.y + el.h);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }, [elements]);

  useEffect(() => { redraw(); }, [redraw]);

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === 'select') return;
    drawing.current = true;
    const pos = getPos(e);
    if (activeTool === 'pen' || activeTool === 'eraser') {
      currentEl.current = { id: uid(), tool: activeTool, points: [pos], color: activeColor, strokeWidth };
    } else if (['rect', 'circle', 'triangle'].includes(activeTool)) {
      currentEl.current = { id: uid(), tool: activeTool, x: pos.x, y: pos.y, w: 0, h: 0, color: activeColor, strokeWidth };
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current || !currentEl.current) return;
    const pos = getPos(e);
    if (currentEl.current.tool === 'pen' || currentEl.current.tool === 'eraser') {
      currentEl.current.points!.push(pos);
    } else if (currentEl.current.x != null && currentEl.current.y != null) {
      currentEl.current.w = pos.x - currentEl.current.x;
      currentEl.current.h = pos.y - currentEl.current.y;
    }
    redraw();
  }

  function onMouseUp() {
    if (!drawing.current || !currentEl.current) return;
    drawing.current = false;
    onAdd({ ...currentEl.current });
    currentEl.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={520}
      className="w-full h-full rounded-xl cursor-crosshair"
      style={{ background: 'transparent' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  );
}

// ─── Tool Button ──────────────────────────────────────────────────────────────

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
        active
          ? 'bg-[rgba(0,255,229,0.15)] text-[#00FFE5] border border-[rgba(0,255,229,0.3)]'
          : 'text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)]'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState('#00FFE5');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [history, setHistory] = useState<DrawElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [tasks, setTasks] = useState<Task[]>([
    { id: uid(), label: 'Analyze market data from Binance', status: 'idle' },
    { id: uid(), label: 'Propose a DCA buy order on Jupiter', status: 'idle' },
  ]);
  const [newTask, setNewTask] = useState('');
  const [taskCount, setTaskCount] = useState(0);
  const [pendingPayment, setPendingPayment] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const addr = localStorage.getItem('wallet_address');
    setWalletAddress(addr);
  }, []);

  // Canvas history helpers
  function pushHistory(els: DrawElement[]) {
    const next = history.slice(0, historyIndex + 1);
    next.push(els);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setElements(history[idx]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setElements(history[idx]);
  }

  function addElement(el: DrawElement) {
    const next = [...elements, el];
    setElements(next);
    pushHistory(next);
  }

  function addTask() {
    if (!newTask.trim()) return;
    setTasks((t) => [...t, { id: uid(), label: newTask.trim(), status: 'idle' }]);
    setNewTask('');
  }

  function removeTask(id: string) {
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  async function runTask(task: Task) {
    if (!walletAddress) return;
    setTasks((t) => t.map((x) => x.id === task.id ? { ...x, status: 'running' } : x));

    // Simulate agent processing
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const newCount = taskCount + 1;
    setTaskCount(newCount);

    // Every 2 tasks: request wallet signature / 0x402 payment
    if (newCount % 2 === 0) {
      setPendingPayment(true);
      setTasks((t) => t.map((x) => x.id === task.id ? { ...x, status: 'done', output: '[Mock] Task completed. Payment approval required for next batch.' } : x));
      return;
    }

    setTasks((t) => t.map((x) =>
      x.id === task.id ? {
        ...x,
        status: 'done',
        output: `[Mock] Task executed successfully. Agent processed: "${task.label}". Testnet TX pending confirmation.`,
      } : x
    ));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file.name);
  }

  function approvePayment() {
    setPendingPayment(false);
    setTasks((t) => t.map((x) => x.status === 'done' ? x : { ...x, status: 'idle' }));
  }

  if (!walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-[rgba(0,255,229,0.1)] border border-[rgba(0,255,229,0.2)] flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00FFE5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" />
              <rect x="3" y="16" width="5" height="5" rx="1" /><rect x="16" y="16" width="5" height="5" rx="1" />
              <line x1="8" y1="5.5" x2="16" y2="5.5" /><line x1="5.5" y1="8" x2="5.5" y2="16" />
              <line x1="18.5" y1="8" x2="18.5" y2="16" /><line x1="8" y1="18.5" x2="16" y2="18.5" />
            </svg>
          </div>
          <h2 className="font-syne text-2xl font-bold text-white mb-2">Workflow Studio</h2>
          <p className="text-gray-400 font-mono text-sm">Connect your Freighter wallet to access the workflow canvas and task planner.</p>
        </motion.div>
      </div>
    );
  }

  const colors = ['#00FFE5', '#FFB800', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#ffffff'];

  return (
    <div className="min-h-screen px-6 py-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-syne text-3xl font-bold text-white mb-1">Workflow Studio</h1>
        <p className="font-mono text-xs text-gray-500">Plan your agent tasks visually, then run them in sequence.</p>
      </motion.div>

      {/* Payment approval banner */}
      {pendingPayment && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[rgba(255,184,0,0.4)] bg-[rgba(255,184,0,0.06)] px-5 py-4 flex items-center justify-between gap-4"
        >
          <div>
            <p className="font-syne font-bold text-[#FFB800] text-sm">0x402 Payment Required</p>
            <p className="font-mono text-xs text-gray-400 mt-0.5">You have completed 2 tasks. Sign the transaction to unlock the next batch.</p>
          </div>
          <button
            onClick={approvePayment}
            className="px-4 py-2 rounded-lg bg-[#FFB800] text-black font-bold text-sm font-mono hover:bg-yellow-300 transition-colors whitespace-nowrap"
          >
            Sign &amp; Approve
          </button>
        </motion.div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ── Drawing Canvas ── */}
        <div className="xl:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">Canvas</p>
            <div className="flex items-center gap-1">
              <button onClick={undo} title="Undo" className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)] text-xs font-mono">↩</button>
              <button onClick={redo} title="Redo" className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)] text-xs font-mono">↪</button>
              <button
                onClick={() => { setElements([]); pushHistory([]); }}
                className="ml-1 px-2 py-1 rounded text-[10px] font-mono text-gray-500 hover:text-red-400 hover:bg-[rgba(255,80,80,0.06)] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex-wrap">
            <ToolBtn active={activeTool === 'pen'} onClick={() => setActiveTool('pen')} title="Pen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </ToolBtn>
            <ToolBtn active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} title="Eraser">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16l13-13 5 5-1 12z"/></svg>
            </ToolBtn>
            <ToolBtn active={activeTool === 'text'} onClick={() => setActiveTool('text')} title="Text">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            </ToolBtn>
            <div className="w-px h-5 bg-[rgba(255,255,255,0.08)] mx-0.5" />
            <ToolBtn active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} title="Rectangle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </ToolBtn>
            <ToolBtn active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} title="Circle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
            </ToolBtn>
            <ToolBtn active={activeTool === 'triangle'} onClick={() => setActiveTool('triangle')} title="Triangle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 22 2 22"/></svg>
            </ToolBtn>
            <div className="w-px h-5 bg-[rgba(255,255,255,0.08)] mx-0.5" />
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${activeColor === c ? 'scale-125 border-white' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
            <div className="w-px h-5 bg-[rgba(255,255,255,0.08)] mx-0.5" />
            <input
              type="range"
              min={1}
              max={8}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-16 accent-[#00FFE5]"
              title="Stroke width"
            />
          </div>

          {/* Canvas area */}
          <div className="rounded-xl border border-[rgba(0,255,229,0.1)] bg-[rgba(0,0,0,0.4)] overflow-hidden" style={{ height: 420 }}>
            <DrawingCanvas
              elements={elements}
              onAdd={addElement}
              activeTool={activeTool}
              activeColor={activeColor}
              strokeWidth={strokeWidth}
            />
          </div>

          {/* File upload */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-xs font-mono text-gray-400 hover:text-white hover:border-[rgba(0,255,229,0.2)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Diagram
            </button>
            {uploadedFile && (
              <span className="font-mono text-[11px] text-[#00FFE5]">{uploadedFile} attached</span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.svg"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* ── Task Planner ── */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">Agent Task Queue</p>

          <div className="flex gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Describe a task for your agent…"
              className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.3)]"
            />
            <button
              onClick={addTask}
              className="px-3 py-2 rounded-lg bg-[rgba(0,255,229,0.1)] border border-[rgba(0,255,229,0.2)] text-[#00FFE5] text-sm font-mono hover:bg-[rgba(0,255,229,0.18)] transition-colors"
            >
              Add
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
            {tasks.length === 0 && (
              <p className="font-mono text-xs text-gray-600 text-center py-8">No tasks yet. Add one above.</p>
            )}
            {tasks.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`rounded-xl border p-3 space-y-2 ${
                  task.status === 'running'
                    ? 'border-[rgba(0,255,229,0.3)] bg-[rgba(0,255,229,0.05)]'
                    : task.status === 'done'
                    ? 'border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.04)]'
                    : task.status === 'error'
                    ? 'border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.04)]'
                    : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-gray-600 shrink-0">#{i + 1}</span>
                    <p className="font-mono text-xs text-white truncate">{task.label}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {task.status === 'idle' && (
                      <button
                        onClick={() => runTask(task)}
                        disabled={pendingPayment}
                        className="px-2 py-1 rounded text-[10px] font-mono bg-[rgba(0,255,229,0.1)] text-[#00FFE5] hover:bg-[rgba(0,255,229,0.2)] disabled:opacity-40 transition-colors"
                      >
                        Run
                      </button>
                    )}
                    {task.status === 'running' && (
                      <span className="font-mono text-[10px] text-[#00FFE5] animate-pulse">Running…</span>
                    )}
                    {task.status === 'done' && (
                      <span className="font-mono text-[10px] text-[#4ade80]">Done</span>
                    )}
                    <button
                      onClick={() => removeTask(task.id)}
                      className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                {task.output && (
                  <p className="font-mono text-[10px] text-gray-400 leading-relaxed border-t border-[rgba(255,255,255,0.04)] pt-2">{task.output}</p>
                )}
              </motion.div>
            ))}
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3 space-y-1">
            <p className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mb-2">Info</p>
            <p className="font-mono text-[11px] text-gray-400">Tasks completed: <span className="text-white">{taskCount}</span></p>
            <p className="font-mono text-[11px] text-gray-400">Next payment gate: <span className="text-[#FFB800]">every 2 tasks</span></p>
            <p className="font-mono text-[11px] text-gray-400">Protocol: <span className="text-[#00FFE5]">0x402 · Testnet</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
