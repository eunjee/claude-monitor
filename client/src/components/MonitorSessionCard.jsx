import { useState, useEffect } from 'react';
import dayjs from 'dayjs';

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDuration(startedAt) {
  const diff = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

const STATUS_CONFIG = {
  active: { color: 'bg-green-500', animate: 'animate-pulse', label: '활성', border: 'border-l-green-500' },
  idle: { color: 'bg-yellow-500', animate: '', label: '대기', border: 'border-l-yellow-500' },
  completed: { color: 'bg-gray-400', animate: '', label: '종료', border: 'border-l-gray-400' },
};

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color} ${cfg.animate}`}
      title={cfg.label}
    />
  );
}

export default function MonitorSessionCard({ session }) {
  const [, setTick] = useState(0);
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.completed;
  const totalTokens = session.tokens.totalInput + session.tokens.totalOutput;

  useEffect(() => {
    if (session.status === 'completed') return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [session.status]);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${cfg.border} p-5 shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={session.status} />
            <span className="text-xs font-medium text-gray-400">{cfg.label}</span>
            <span className="text-sm font-medium text-gray-500">
              {session.projectLabel}
            </span>
          </div>
          <p className="text-gray-800 font-medium">
            {session.lastPrompt || session.firstPrompt || '(프롬프트 없음)'}
          </p>
          {session.lastPrompt && session.firstPrompt && session.lastPrompt !== session.firstPrompt && (
            <p className="text-xs text-gray-400 mt-1 truncate">
              처음: {session.firstPrompt}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span>{formatDuration(session.startedAt)}</span>
        <span>토큰: {formatTokens(totalTokens)}</span>
        {session.toolCallCount > 0 && (
          <span>도구: {session.toolCallCount}회</span>
        )}
        {session.model && <span>{session.model}</span>}
      </div>
    </div>
  );
}
