import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveProjectPath, extractProjectLabel, labelFromDirName } from '../utils/pathDecoder.js';
import { readFirstTimestamp, parseSessionSummary } from './jsonlParser.js';
import dayjs from 'dayjs';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');

export const projectCache = new Map();
const dateIndex = new Map();
let indexBuilt = false;

export async function getProjects() {
  const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
    const stat = fs.statSync(path.join(PROJECTS_DIR, d));
    return stat.isDirectory();
  });

  const projects = [];
  for (const dir of dirs) {
    let info = projectCache.get(dir);
    if (!info) {
      const projectPath = await resolveProjectPath(dir, PROJECTS_DIR);
      info = {
        id: dir,
        path: projectPath,
        label: extractProjectLabel(projectPath) || labelFromDirName(dir),
      };
      projectCache.set(dir, info);
    }

    const jsonlFiles = listJsonlFiles(dir);
    projects.push({ ...info, sessionCount: jsonlFiles.length });
  }

  return projects.sort((a, b) => a.label.localeCompare(b.label));
}

export async function buildDateIndex() {
  if (indexBuilt) return;

  const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory(); }
    catch { return false; }
  });

  const promises = [];
  for (const dir of dirs) {
    const files = listJsonlFiles(dir);
    for (const file of files) {
      const filePath = path.join(PROJECTS_DIR, dir, file);
      promises.push(indexFile(filePath, dir));
    }
  }

  await Promise.all(promises);
  indexBuilt = true;
  console.log(`Date index built: ${dateIndex.size} sessions`);
}

async function indexFile(filePath, projectDir) {
  if (dateIndex.has(filePath)) return;
  const timestamp = await readFirstTimestamp(filePath);
  if (timestamp) {
    dateIndex.set(filePath, {
      projectDir,
      startDate: dayjs(timestamp).format('YYYY-MM-DD'),
      fileName: path.basename(filePath),
    });
  }
}

export async function refreshIndex() {
  const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory(); }
    catch { return false; }
  });

  const newFiles = [];
  for (const dir of dirs) {
    const files = listJsonlFiles(dir);
    for (const file of files) {
      const filePath = path.join(PROJECTS_DIR, dir, file);
      if (!dateIndex.has(filePath)) {
        newFiles.push(indexFile(filePath, dir));
      }
    }
  }

  if (newFiles.length > 0) await Promise.all(newFiles);
}

export async function getSessionsByDate(date, projectFilter) {
  await refreshIndex();

  const targetDate = dayjs(date).format('YYYY-MM-DD');
  const matchingFiles = [];

  for (const [filePath, info] of dateIndex) {
    if (info.startDate !== targetDate) continue;
    if (projectFilter && projectFilter !== 'all' && info.projectDir !== projectFilter) continue;
    matchingFiles.push({ filePath, ...info });
  }

  const activeSessions = getActiveSessions();

  const results = [];
  for (const file of matchingFiles) {
    const summary = await parseSessionSummary(file.filePath);
    if (!summary) continue;

    const project = projectCache.get(file.projectDir);
    results.push({
      ...summary,
      fileKey: file.fileName,
      projectDir: file.projectDir,
      projectPath: project?.path || file.projectDir,
      projectLabel: project?.label || file.projectDir,
      isActive: activeSessions.has(summary.sessionId),
    });
  }

  return results.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
}

export async function getSessionsByProject(projectDir) {
  await refreshIndex();

  const matchingFiles = [];
  for (const [filePath, info] of dateIndex) {
    if (info.projectDir !== projectDir) continue;
    matchingFiles.push({ filePath, ...info });
  }

  const activeSessions = getActiveSessions();

  const results = [];
  for (const file of matchingFiles) {
    const summary = await parseSessionSummary(file.filePath);
    if (!summary) continue;

    const project = projectCache.get(projectDir);
    results.push({
      ...summary,
      fileKey: file.fileName,
      projectDir,
      projectPath: project?.path || projectDir,
      projectLabel: project?.label || projectDir,
      isActive: activeSessions.has(summary.sessionId),
    });
  }

  return results.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export function getAvailableDates(projectFilter) {
  const dates = new Set();
  for (const [, info] of dateIndex) {
    if (projectFilter && projectFilter !== 'all' && info.projectDir !== projectFilter) continue;
    dates.add(info.startDate);
  }
  return [...dates].sort().reverse();
}

function listJsonlFiles(projectDir) {
  try {
    return fs.readdirSync(path.join(PROJECTS_DIR, projectDir)).filter(
      (f) => f.endsWith('.jsonl') && !f.startsWith('agent-')
    );
  } catch { return []; }
}

function getActiveSessions() {
  const active = new Set();
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf-8')
        );
        if (content.pid && isProcessRunning(content.pid)) {
          active.add(content.sessionId);
        }
      } catch { /* skip */ }
    }
  } catch { /* sessions dir may not exist */ }
  return active;
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
