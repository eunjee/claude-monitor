import dayjs from 'dayjs';
import ToolCallList from './ToolCallList';

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function StatusDot({ isActive }) {
  if (!isActive) return null;
  return <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" title="활성 세션" />;
}

export default function SessionCard({ session }) {
  const start = dayjs(session.startedAt).format('HH:mm');
  const end = dayjs(session.endedAt).format('HH:mm');
  const totalTokens = session.tokens.totalInput + session.tokens.totalOutput;
  const toolEntries = Object.entries(session.toolUsage);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot isActive={session.isActive} />
            <span className="text-sm font-medium text-gray-500">
              {session.projectLabel}
            </span>
          </div>
          <p className="text-gray-800 font-medium">
            {session.firstPrompt || '(프롬프트 없음)'}
          </p>
        </div>
      </div>

      {session.toolCalls.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-500 mb-2">
            실행한 명령어/툴 ({session.toolCalls.length}회)
          </h4>
          <ToolCallList toolCalls={session.toolCalls} />
        </div>
      )}

      {session.filesChanged.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-500 mb-1">
            변경된 파일 ({session.filesChanged.length}개)
          </h4>
          <div className="space-y-0.5">
            {session.filesChanged.slice(0, 10).map((fc, i) => (
              <div key={i} className="text-sm font-mono flex gap-2">
                <span className={fc.action === 'created' ? 'text-green-600' : 'text-yellow-600'}>
                  {fc.action === 'created' ? '+' : '~'}
                </span>
                <span className="text-gray-600 truncate">{fc.path}</span>
              </div>
            ))}
            {session.filesChanged.length > 10 && (
              <span className="text-xs text-gray-400 ml-5">
                +{session.filesChanged.length - 10}개
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span>{start} ~ {end}</span>
        <span>토큰: {formatTokens(totalTokens)}</span>
        {session.model && <span>{session.model}</span>}
        {toolEntries.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {toolEntries.map(([name, count]) => (
              <span key={name} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                {name} {count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
