import { Router } from 'express';
import { getMonitorSnapshot, addSSEClient, removeSSEClient } from '../services/sessionMonitor.js';

const router = Router();

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const snapshot = getMonitorSnapshot();
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

  addSSEClient(res);

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); }
    catch { clearInterval(keepalive); }
  }, 30_000);

  req.on('close', () => {
    clearInterval(keepalive);
    removeSSEClient(res);
  });
});

export default router;
