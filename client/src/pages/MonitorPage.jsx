import { useState, useEffect, useRef, useMemo } from 'react';
import { createMonitorStream } from '../api/client';
import SlidePanel from '../components/SlidePanel';
import { getProjectColor, formatTokens } from '../utils/colors';

const STATUS = {
  active: { label: '활성', color: 'var(--gn)' },
  idle: { label: '대기', color: 'var(--yw)' },
  completed: { label: '종료', color: 'var(--dm)' },
};

const HINT_LABEL = {
  user_input: 'AI 응답 중',
  tool_use: '도구 실행 중',
  tool_pending: '승인 대기',
  assistant_end: '응답 완료',
  turn_ended: '입력 대기',
};

const HINT_STYLE = {
  tool_pending: { color: 'var(--rd)', borderColor: 'rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)' },
  user_input: { color: 'var(--gn)', borderColor: 'rgba(74,222,128,.3)', background: 'rgba(74,222,128,.08)' },
};

function resolveHint(session) {
  if (!session.activityHint || session.status === 'completed') return null;
  if (session.activityHint === 'tool_use') {
    const secSince = (Date.now() - session.lastActivity) / 1000;
    if (secSince <= 15) return 'tool_use';
    if (secSince <= 600) return 'tool_pending';
    return 'turn_ended';
  }
  return session.activityHint;
}

function formatDuration(startedAt) {
  const diff = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

export default function MonitorPage() {
  const [sessions, setSessions] = useState({});
  const [connected, setConnected] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [, setTick] = useState(0);
  const esRef = useRef(null);

  useEffect(() => {
    const es = createMonitorStream((event, data) => {
      if (event === 'snapshot') {
        const map = {};
        for (const s of data) map[s.sessionId] = s;
        setSessions(map);
        setConnected(true);
      } else if (event === 'update') {
        setSessions((prev) => ({ ...prev, [data.sessionId]: data }));
      }
    });
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const allSessions = useMemo(() => {
    return Object.values(sessions).map((s) => ({
      ...s,
      _color: getProjectColor(s.projectLabel),
      _duration: formatDuration(s.startedAt),
    }));
  }, [sessions]);

  const filtered = useMemo(() => {
    return allSessions
      .filter((s) => statusFilter === 'all' || s.status === statusFilter)
      .sort((a, b) => {
        const order = { active: 0, idle: 1, completed: 2 };
        return (order[a.status] ?? 2) - (order[b.status] ?? 2);
      });
  }, [allSessions, statusFilter]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((s) => {
      const key = s.projectLabel;
      if (!map[key]) map[key] = { label: key, color: s._color, sessions: [] };
      map[key].sessions.push(s);
    });
    return Object.values(map);
  }, [filtered]);

  const counts = useMemo(() => {
    const all = allSessions;
    return {
      total: all.length,
      active: all.filter((s) => s.status === 'active').length,
      idle: all.filter((s) => s.status === 'idle').length,
      completed: all.filter((s) => s.status === 'completed').length,
    };
  }, [allSessions]);

  const totalTokens = allSessions.reduce(
    (a, s) => a + (s.tokens?.totalInput || 0) + (s.tokens?.totalOutput || 0), 0
  );

  const selected = allSessions.find((s) => s.sessionId === selectedId);
  const flatIds = filtered.map((s) => s.sessionId);
  const selectedIdx = flatIds.indexOf(selectedId);

  return (
    <>
      <div style={{
        background: 'var(--s1)', borderBottom: '1px solid var(--bd)',
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: connected ? 'var(--gn)' : 'var(--rd)',
              animation: connected ? 'livePulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
              실시간 모니터링
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--mt)' }}>
            {connected ? 'SSE 연결됨' : '연결 끊김'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <StatusTab
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            count={counts.total}
          >
            전체
          </StatusTab>
          <StatusTab
            active={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            dotColor="var(--gn)" count={counts.active}
          >
            활성
          </StatusTab>
          <StatusTab
            active={statusFilter === 'idle'}
            onClick={() => setStatusFilter('idle')}
            dotColor="var(--yw)" count={counts.idle}
          >
            대기
          </StatusTab>
          <StatusTab
            active={statusFilter === 'completed'}
            onClick={() => setStatusFilter('completed')}
            dotColor="var(--dm)" count={counts.completed}
          >
            종료
          </StatusTab>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <StatCard value={counts.total} label="세션" />
          <StatCard value={counts.active} label="활성" />
          <StatCard value={formatTokens(totalTokens)} label="토큰" />
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        alignContent: 'start',
        transition: 'padding-right .3s',
        paddingRight: selected ? 500 : 16,
      }}>
        {grouped.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 20px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--s2)',
              border: '1px solid var(--bd)', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <span style={{ fontSize: 20, color: 'var(--dm)' }}>∅</span>
            </div>
            <p style={{ color: 'var(--tx2)', fontSize: 14 }}>
              {statusFilter !== 'all'
                ? `${STATUS[statusFilter]?.label || ''} 세션이 없습니다`
                : '세션 없음'}
            </p>
            <p style={{ color: 'var(--dm)', fontSize: 12, marginTop: 4 }}>
              Claude Code 세션이 시작되면 자동으로 표시됩니다
            </p>
          </div>
        )}

        {grouped.map((g) => (
          <MonitorCell key={g.label} group={g} selectedId={selectedId} onSelect={setSelectedId} />
        ))}
      </div>

      <SlidePanel
        session={selected}
        onClose={() => setSelectedId(null)}
        onPrev={selectedIdx > 0 ? () => setSelectedId(flatIds[selectedIdx - 1]) : null}
        onNext={selectedIdx < flatIds.length - 1 ? () => setSelectedId(flatIds[selectedIdx + 1]) : null}
        hasPrev={selectedIdx > 0}
        hasNext={selectedIdx < flatIds.length - 1}
      >
        {selected && <MonitorDetail session={selected} />}
      </SlidePanel>
    </>
  );
}

function MonitorCell({ group, selectedId, onSelect }) {
  const hasActive = group.sessions.some((s) => s.status === 'active');
  const hasIdle = group.sessions.some((s) => s.status === 'idle');
  const statusCls = hasActive ? 'has-active' : hasIdle ? 'all-idle' : 'all-done';
  const statusLabel = hasActive ? '활성' : hasIdle ? '대기' : '종료';

  return (
    <div style={{
      background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
      display: 'flex', flexDirection: 'column', maxHeight: 500,
      boxShadow: 'var(--shadow)', transition: 'all .2s',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span className={`c-${group.color}`} style={{ width: 10, height: 10, borderRadius: 4, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{group.label}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--rx)',
          marginLeft: 'auto',
          background: statusCls === 'has-active' ? 'rgba(74,222,128,.12)' :
            statusCls === 'all-idle' ? 'rgba(251,191,36,.12)' : 'rgba(90,90,112,.12)',
          color: statusCls === 'has-active' ? 'var(--gn)' :
            statusCls === 'all-idle' ? 'var(--yw)' : 'var(--mt)',
        }}>
          {statusLabel}
        </span>
        <span style={{
          fontSize: 11, color: 'var(--dm)', background: 'var(--s2)',
          padding: '2px 10px', borderRadius: 'var(--rx)',
        }}>
          {group.sessions.length}개
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {group.sessions.map((s) => (
          <MonitorCard
            key={s.sessionId}
            session={s}
            isSelected={s.sessionId === selectedId}
            onClick={() => onSelect(s.sessionId)}
          />
        ))}
      </div>
    </div>
  );
}

function MonitorCard({ session, isSelected, onClick }) {
  const st = STATUS[session.status] || STATUS.completed;
  const totalTokens = (session.tokens?.totalInput || 0) + (session.tokens?.totalOutput || 0);
  const isPending = resolveHint(session) === 'tool_pending';
  const borderLeftColor = isPending ? 'var(--rd)' :
    session.status === 'active' ? 'var(--gn)' :
    session.status === 'idle' ? 'var(--yw)' : 'var(--dm)';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--s2)',
        border: `1px solid ${isSelected ? 'var(--ac)' : 'var(--bd)'}`,
        borderLeft: `3px solid ${isSelected ? 'var(--ac)' : borderLeftColor}`,
        borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 8,
        cursor: 'pointer', transition: 'all .15s',
        boxShadow: isSelected ? '0 0 0 1px var(--ac)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--bd-h)';
          e.currentTarget.style.background = 'linear-gradient(135deg, var(--s2), rgba(129,140,248,.03))';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--bd)';
          e.currentTarget.style.borderLeft = `3px solid ${borderLeftColor}`;
          e.currentTarget.style.background = 'var(--s2)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: st.color,
          animation: session.status === 'active' ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px',
          color: st.color,
        }}>
          {st.label}
        </span>
        {(() => {
          const hint = resolveHint(session);
          if (!hint) return null;
          const hs = HINT_STYLE[hint] || {};
          return (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 'var(--rx)',
              color: hs.color || 'var(--mt)',
              background: hs.background || 'var(--bg)',
              border: `1px solid ${hs.borderColor || 'var(--bd)'}`,
              fontWeight: hint === 'tool_pending' ? 600 : 500,
            }}>
              {HINT_LABEL[hint] || hint}
            </span>
          );
        })()}
        <span style={{
          fontSize: 10, color: 'var(--dm)', marginLeft: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {session._duration}
        </span>
      </div>

      {resolveHint(session) === 'tool_pending' && (
        <div style={{
          fontSize: 12, padding: '8px 10px', marginBottom: 8,
          borderRadius: 'var(--rs)', lineHeight: 1.5,
          background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
        }}>
          <div style={{ color: 'var(--rd)', fontWeight: 600, marginBottom: 3 }}>
            승인 대기 — {session.lastToolName || '도구'}
          </div>
          {session.lastToolInput && (
            <div style={{
              color: 'var(--mt)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session.lastToolInput}
            </div>
          )}
        </div>
      )}

      <div style={{
        fontSize: 13, color: '#d4d4d8', lineHeight: 1.6, marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {session.lastPrompt || session.firstPrompt || '(프롬프트 없음)'}
      </div>

      {session.status === 'active' && (
        <div style={{ marginTop: 8, marginBottom: 4 }}>
          <div style={{ height: 3, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: '72%',
              background: 'linear-gradient(90deg, var(--gn), #22d3ee)',
              animation: 'progressShimmer 2s infinite',
            }} />
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', gap: 5, flexWrap: 'wrap',
        paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.04)',
      }}>
        <Tag>{formatTokens(totalTokens)}</Tag>
        {session.toolCallCount > 0 && <Tag>도구 {session.toolCallCount}회</Tag>}
        {session.model && <Tag>{session.model}</Tag>}
      </div>
    </div>
  );
}

function MonitorDetail({ session }) {
  const totalTokens = (session.tokens?.totalInput || 0) + (session.tokens?.totalOutput || 0);
  const st = STATUS[session.status] || STATUS.completed;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div className={`b-${session._color}`} style={{
          fontSize: 12, fontWeight: 600, padding: '4px 12px',
          borderRadius: 'var(--rx)', display: 'inline-block',
        }}>
          {session.projectLabel}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, padding: '5px 14px',
          borderRadius: 'var(--rx)', marginLeft: 10,
          background: session.status === 'active' ? 'rgba(74,222,128,.12)' :
            session.status === 'idle' ? 'rgba(251,191,36,.12)' : 'rgba(90,90,112,.12)',
          color: st.color,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          {st.label}
        </span>
        {(() => {
          const hint = resolveHint(session);
          if (!hint) return null;
          const hs = HINT_STYLE[hint] || {};
          return (
            <span style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 'var(--rx)',
              marginLeft: 8,
              color: hs.color || 'var(--mt)',
              background: hs.background || 'var(--s2)',
              border: `1px solid ${hs.borderColor || 'var(--bd)'}`,
              fontWeight: hint === 'tool_pending' ? 600 : 500,
            }}>
              {HINT_LABEL[hint] || hint}
            </span>
          );
        })()}
      </div>

      <div style={{ fontSize: 17, fontWeight: 500, color: '#fafafa', lineHeight: 1.7, marginBottom: 24 }}>
        {session.lastPrompt || session.firstPrompt || '(프롬프트 없음)'}
      </div>

      {session.firstPrompt && session.lastPrompt && session.firstPrompt !== session.lastPrompt && (
        <div style={{
          fontSize: 12, color: 'var(--dm)', margin: '-16px 0 20px',
          padding: '8px 12px', background: 'var(--s2)',
          borderRadius: 'var(--rx)', border: '1px solid var(--bd)',
        }}>
          처음: {session.firstPrompt}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <DetailStat value={formatTokens(totalTokens)} label="총 토큰" />
        <DetailStat value={session.toolCallCount || 0} label="도구 호출" />
        <DetailStat value={session._duration} label="경과 시간" />
      </div>

      {session.status === 'active' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: '72%',
              background: 'linear-gradient(90deg, var(--gn), #22d3ee)',
              animation: 'progressShimmer 2s infinite',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 4 }}>작업 진행 중...</div>
        </div>
      )}

      <div style={{
        display: 'flex', gap: 16, fontSize: 12, color: 'var(--mt)',
        paddingTop: 16, borderTop: '1px solid var(--bd)', marginTop: 24,
      }}>
        <span>시작: {new Date(session.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>입력: {formatTokens(session.tokens?.totalInput || 0)}</span>
        <span>출력: {formatTokens(session.tokens?.totalOutput || 0)}</span>
        {session.model && <span>{session.model}</span>}
      </div>
    </>
  );
}

function StatusTab({ active, onClick, dotColor, count, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 'var(--rx)',
        border: '1px solid var(--bd)',
        background: active ? 'var(--s2)' : 'transparent',
        borderColor: active ? 'var(--bd2)' : 'var(--bd)',
        color: active ? 'var(--tx)' : 'var(--tx2)',
        fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
        cursor: 'pointer', transition: 'all .15s',
      }}
    >
      {dotColor && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />}
      {children}
      <span style={{
        fontSize: 10, fontWeight: 700,
        background: active ? 'var(--bg)' : 'var(--s2)',
        padding: '1px 7px', borderRadius: 'var(--rx)', color: 'var(--mt)',
      }}>
        {count}
      </span>
    </button>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
      padding: '10px 18px', textAlign: 'center', minWidth: 90,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fafafa', letterSpacing: '-.5px' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
    </div>
  );
}

function DetailStat({ value, label }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
      padding: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fafafa', letterSpacing: '-.5px' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 'var(--rx)',
      background: 'var(--bg)', color: 'var(--mt)', fontWeight: 500,
      border: '1px solid var(--bd)',
    }}>
      {children}
    </span>
  );
}
