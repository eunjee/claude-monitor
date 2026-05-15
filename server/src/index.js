import express from 'express';
import cors from 'cors';
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
