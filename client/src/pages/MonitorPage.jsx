import { useState, useEffect, useRef } from 'react';
import { createMonitorStream } from '../api/client';
import MonitorSessionCard from '../components/MonitorSessionCard';

export default function MonitorPage() {
  const [sessions, setSessions] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
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
  const filtered = allSessions.filter((s) => {
    if (hideCompleted && s.status === 'completed') return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    const order = { active: 0, idle: 1, completed: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });

  const activeCount = filtered.filter((s) => s.status !== 'completed').length;
  const completedCount = filtered.filter((s) => s.status === 'completed').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">실시간 모니터링</h2>
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-500">
            활성 {activeCount}개
            {completedCount > 0 && ` · 종료 ${completedCount}개`}
          </span>
        </div>
        {completedCount > 0 && (
          <button
            onClick={() => setHideCompleted((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-100"
          >
            {hideCompleted ? '종료 세션 보기' : '종료 세션 숨기기'}
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-block w-3 h-3 rounded-full bg-gray-300 animate-pulse mb-4" />
          <p className="text-gray-400">
            {hideCompleted ? '활성 세션 없음' : '세션 없음'}
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Claude Code 세션이 시작되면 자동으로 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((session) => (
            <MonitorSessionCard key={session.sessionId} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
