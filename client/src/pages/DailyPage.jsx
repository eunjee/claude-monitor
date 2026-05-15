import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import DateNavigator from '../components/DateNavigator';
import SessionCard from '../components/SessionCard';
import { fetchDailySessions } from '../api/client';

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export default function DailyPage({ project = 'all' }) {
  const { date } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDailySessions(date, project)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date, project]);

  const handleDateChange = (newDate) => {
    navigate(`/daily/${newDate}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <DateNavigator date={date} onDateChange={handleDateChange} />
      </div>

      {loading && (
        <div className="text-center text-gray-500 py-12">불러오는 중...</div>
      )}

      {!loading && data && (
        <>
          <div className="mb-4 text-sm text-gray-600">
            세션 {data.totalSessions}개 | 총 토큰{' '}
            {formatTokens(data.totalTokens.input + data.totalTokens.output)}
          </div>

          {data.sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              이 날짜에 세션이 없습니다
            </div>
          ) : (
            <div className="space-y-4">
              {data.sessions.map((session) => (
                <SessionCard key={session.fileKey || session.sessionId} session={session} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
