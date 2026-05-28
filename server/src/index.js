import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import projectsRouter from './routes/projects.js';
import sessionsRouter from './routes/sessions.js';
import dailyRouter from './routes/daily.js';
import monitorRouter from './routes/monitor.js';
import { buildDateIndex } from './services/projectScanner.js';
import { initWatcher } from './services/sessionMonitor.js';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/daily', dailyRouter);
app.use('/api/monitor', monitorRouter);

// 빌드된 클라이언트 서빙 (Electron 위젯 / PWA 프로덕션용)
// client/dist 가 존재할 때만 활성화 — dev 모드(Vite 5173)에는 영향 없음
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA 폴백: /api 외 GET 요청은 index.html 로
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

async function start() {
  console.log('Building date index...');
  await buildDateIndex();
  await initWatcher();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
