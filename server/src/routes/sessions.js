import { Router } from 'express';
import { getSessionsByProject } from '../services/projectScanner.js';

const router = Router();

router.get('/:projectId', async (req, res, next) => {
  try {
    const sessions = await getSessionsByProject(req.params.projectId);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

export default router;
