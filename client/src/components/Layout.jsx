import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ProjectSelector from './ProjectSelector';

const STORAGE_KEY = 'dashboard-selected-project';

export default function Layout({ children }) {
  const [project, setProject] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'all';
  });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, project);
  }, [project]);

  const isDaily = location.pathname.startsWith('/daily');
  const isMonitor = location.pathname === '/monitor';

  const tabClass = (active) =>
    `px-3 py-1.5 rounded-md text-sm ${
      active
        ? 'bg-blue-100 text-blue-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-800">
              Claude Session Dashboard
            </h1>
            <nav className="flex gap-1">
              <button
                className={tabClass(isDaily)}
                onClick={() => navigate(`/daily/${dayjs().format('YYYY-MM-DD')}`)}
              >
                일자별
              </button>
              <button
                className={tabClass(isMonitor)}
                onClick={() => navigate('/monitor')}
              >
                모니터링
              </button>
            </nav>
          </div>
          {!isMonitor && <ProjectSelector value={project} onChange={setProject} />}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {typeof children === 'function' ? children({ project }) : children}
      </main>
    </div>
  );
}
