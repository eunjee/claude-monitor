import { useState } from 'react';

const INITIAL_SHOW = 5;

const TOOL_ICONS = {
  Bash: '$ ',
  Write: '+ ',
  Edit: '~ ',
  Read: '> ',
  Grep: '? ',
  Glob: '* ',
};

export default function ToolCallList({ toolCalls }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? toolCalls : toolCalls.slice(0, INITIAL_SHOW);
  const remaining = toolCalls.length - INITIAL_SHOW;

  return (
    <div className="space-y-1">
      {visible.map((tc, i) => (
        <div key={i} className="flex items-start gap-2 text-sm font-mono">
          <span className="text-gray-400 shrink-0 w-5">
            {TOOL_ICONS[tc.name] || ''}
          </span>
          <span className="text-blue-600 shrink-0">{tc.name}:</span>
          <span className="text-gray-600 truncate">{tc.input}</span>
        </div>
      ))}
      {remaining > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm text-blue-500 hover:underline ml-7"
        >
          +{remaining}개 더보기
        </button>
      )}
      {expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-blue-500 hover:underline ml-7"
        >
          접기
        </button>
      )}
    </div>
  );
}
