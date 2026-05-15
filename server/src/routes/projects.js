import { Router } from 'express';
import { getProjects } from '../services/projectScanner.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

export default router;
