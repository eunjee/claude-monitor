import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import dayjs from 'dayjs';
import Layout from './components/Layout';
import DailyPage from './pages/DailyPage';
import MonitorPage from './pages/MonitorPage';
import WidgetPage from './pages/WidgetPage';

export default function App() {
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <BrowserRouter>
      <Routes>
        {/* 위젯 모드 — Layout(헤더/탭) 없이 컴팩트 화면만 */}
        <Route path="/widget" element={<WidgetPage />} />
        <Route
          path="/*"
          element={
            <Layout>
              {({ project }) => (
                <Routes>
                  <Route path="/" element={<Navigate to={`/daily/${today}`} replace />} />
                  <Route path="/daily/:date" element={<DailyPage project={project} />} />
                  <Route path="/monitor" element={<MonitorPage />} />
                </Routes>
              )}
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
