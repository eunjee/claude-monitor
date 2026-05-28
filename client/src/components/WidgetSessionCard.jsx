import { useState, useEffect } from 'react';

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

export default function WidgetSessionCard({ session }) {
  const [, setTick] = useState(0);
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.completed;
  const totalTokens = session.tokens.totalInput + session.tokens.totalOutput;

  useEffect(() => {
    if (session.status === 'completed') return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [session.status]);

  return (
    <div className={`bg-white rounded-md border border-gray-200 border-l-4 ${cfg.border} px-3 py-2.5 shadow-sm`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${cfg.color} ${cfg.animate}`} />
        <span className="text-[10px] font-medium text-gray-400">{cfg.label}</span>
        <span className="text-[11px] font-medium text-gray-500 truncate">
          {session.projectLabel}
        </span>
      </div>
      <p className="text-[13px] leading-snug text-gray-800 font-medium line-clamp-2">
        {session.lastPrompt || session.firstPrompt || '(프롬프트 없음)'}
      </p>
      <div className="flex items-center gap-2.5 text-[10px] text-gray-400 mt-1.5">
        <span>{formatDuration(session.startedAt)}</span>
        <span>토큰 {formatTokens(totalTokens)}</span>
        {session.toolCallCount > 0 && <span>도구 {session.toolCallCount}</span>}
      </div>
    </div>
  );
}
