import { Router } from 'express';
import { getSessionsByDate, getAvailableDates } from '../services/projectScanner.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { date, project } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date query parameter required' });
    }

    const sessions = await getSessionsByDate(date, project || 'all');

    let totalInput = 0;
    let totalOutput = 0;
    for (const s of sessions) {
      totalInput += s.tokens.totalInput;
      totalOutput += s.tokens.totalOutput;
    }

    res.json({
      date,
      totalSessions: sessions.length,
      totalTokens: { input: totalInput, output: totalOutput },
      sessions,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/dates', async (req, res, next) => {
  try {
    const { project } = req.query;
    const dates = getAvailableDates(project || 'all');
    res.json(dates);
  } catch (err) {
    next(err);
  }
});

export default router;
