import { useState, useEffect, useRef } from 'react';
import { createMonitorStream } from '../api/client';
import WidgetSessionCard from '../components/WidgetSessionCard';

// Electron 위젯으로 실행 중인지 (preload 가 주입)
const electron = typeof window !== 'undefined' ? window.electronWidget : undefined;

export default function WidgetPage() {
  const [sessions, setSessions] = useState({});
  const [hideCompleted, setHideCompleted] = useState(true);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    const es = createMonitorStream((event, data) => {
      if (event === 'snapshot') {
        const map = {};
        for (const s of data) { map[s.sessionId] = s; }
        setSessions(map);
        setConnected(true);
      } else if (event === 'update') {
        setSessions((prev) => ({ ...prev, [data.sessionId]: data }));
      }
    });
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => { es.close(); };
  }, []);

  const allSessions = Object.values(sessions);
  const filtered = allSessions.filter((s) => !(hideCompleted && s.status === 'completed'));
  const sorted = filtered.sort((a, b) => {
    const order = { active: 0, idle: 1, completed: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });
  const activeCount = allSessions.filter((s) => s.status !== 'completed').length;

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800">
      {/* 드래그 가능한 헤더 (Electron 프레임리스 창 이동용) */}
      <header
        className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 select-none"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-[13px] font-semibold">세션 모니터</span>
        <span className="text-[11px] text-gray-400">활성 {activeCount}</span>
        <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => setHideCompleted((v) => !v)}
            title={hideCompleted ? '종료 세션 보기' : '종료 세션 숨기기'}
            className="text-[11px] text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100"
          >
            {hideCompleted ? '전체' : '활성만'}
          </button>
          {electron && (
            <button
              onClick={() => electron.close()}
              title="닫기"
              className="text-gray-400 hover:text-white hover:bg-red-500 w-5 h-5 rounded flex items-center justify-center text-xs leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-2 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300 animate-pulse mb-3" />
            <p className="text-xs text-gray-400">세션 없음</p>
            <p className="text-[10px] text-gray-300 mt-1">
              Claude Code 세션이 시작되면 표시됩니다
            </p>
          </div>
        ) : (
          sorted.map((session) => (
            <WidgetSessionCard key={session.sessionId} session={session} />
          ))
        )}
      </main>
    </div>
  );
}
