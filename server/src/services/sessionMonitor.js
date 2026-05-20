import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { SESSIONS_DIR, PROJECTS_DIR, projectCache, isProcessRunning, getProjects } from './projectScanner.js';
import { parseSessionIncremental } from './jsonlParser.js';

const IDLE_THRESHOLD_MS = 120_000;      // 2분: active ↔ idle 경계
const POLL_INTERVAL_MS = 5_000;         // 5초마다 상태 폴링
const DEBOUNCE_MS = 500;
const ZOMBIE_SESSION_MS = 1_800_000;    // 30분: 프로세스 alive + 무활동 → completed

const sseClients = new Set();
const activeSessions = new Map();
const jsonlWatchers = new Map();
const debounceTimers = new Map();

let sessionsWatcher = null;
let pollTimer = null;

export async function initWatcher() {
  if (projectCache.size === 0) await getProjects();
  await bootstrapActiveSessions();

  sessionsWatcher = chokidar.watch(path.join(SESSIONS_DIR, '*.json'), {
    ignoreInitial: true,
    persistent: true,
  });

  sessionsWatcher.on('add', (fp) => handleSessionFile(fp));
  sessionsWatcher.on('change', (fp) => handleSessionFile(fp));
  sessionsWatcher.on('unlink', (fp) => handleSessionFileRemoved(fp));

  pollTimer = setInterval(pollSessionStatus, POLL_INTERVAL_MS);
  console.log(`Session monitor started. Tracking ${activeSessions.size} active sessions.`);
}

async function bootstrapActiveSessions() {
  let files;
  try { files = fs.readdirSync(SESSIONS_DIR); }
  catch { return; }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    await handleSessionFile(path.join(SESSIONS_DIR, file));
  }
}

async function handleSessionFile(filePath) {
  let content;
  try {
    content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return; }

  const { pid, sessionId, cwd, startedAt } = content;
  if (!pid || !sessionId) return;

  const pidAlive = isProcessRunning(pid);

  const existing = activeSessions.get(sessionId);
  if (existing) {
    if (!pidAlive) {
      markCompleted(sessionId);
      return;
    }
    if (existing.status === 'completed') {
      reactivateSession(existing, pid);
    }
    return;
  }

  const pidAlreadyTracked = [...activeSessions.values()].some(s => s.pid === pid);
  if (pidAlreadyTracked) return;

  if (!pidAlive) return;

  let projectDir = findProjectDir(cwd);
  let jsonlPath = findJsonlPath(projectDir, sessionId);

  if (!projectDir && jsonlPath) {
    const parent = path.basename(path.dirname(jsonlPath));
    projectDir = parent;
  }

  if (!jsonlPath && projectDir) {
    jsonlPath = findJsonlPath(projectDir, sessionId);
  }

  const project = projectDir ? projectCache.get(projectDir) : null;

  const session = {
    sessionId,
    pid,
    projectDir: projectDir || '',
    projectLabel: project?.label || extractLastSegment(cwd),
    status: 'active',
    startedAt: startedAt || Date.now(),
    firstPrompt: '',
    lastPrompt: '',
    lastActivity: jsonlPath ? getFileMtime(jsonlPath) : (startedAt || getFileMtime(filePath)),
    tokens: { totalInput: 0, totalOutput: 0 },
    toolCallCount: 0,
    model: null,
    jsonlPath,
    lastOffset: 0,
  };

  activeSessions.set(sessionId, session);

  if (jsonlPath) {
    await parseAndUpdate(sessionId);
    watchJsonl(sessionId, jsonlPath);
  }

  broadcast('update', toClientData(session));
}

function handleSessionFileRemoved(filePath) {
  const pidStr = path.basename(filePath, '.json');
  for (const [sessionId, session] of activeSessions) {
    if (String(session.pid) === pidStr) {
      markCompleted(sessionId);
      break;
    }
  }
}

function markCompleted(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (session.status === 'completed') return;
  session.status = 'completed';
  unwatchJsonl(sessionId);
  broadcast('update', toClientData(session));
}

function reactivateSession(session, newPid) {
  if (newPid) session.pid = newPid;
  session.status = 'active';
  session.lastActivity = session.jsonlPath
    ? getFileMtime(session.jsonlPath)
    : Date.now();

  if (session.jsonlPath && !jsonlWatchers.has(session.sessionId)) {
    watchJsonl(session.sessionId, session.jsonlPath);
    parseAndUpdate(session.sessionId);
  }

  broadcast('update', toClientData(session));
}

function tryUpgradeJsonl(sessionId, session) {
  if (!session.projectDir) return false;

  const latestJsonl = findLatestJsonlInProject(session.projectDir);
  if (!latestJsonl || latestJsonl === session.jsonlPath) return false;

  const latestMtime = getFileMtime(latestJsonl);
  const currentMtime = session.jsonlPath ? getFileMtime(session.jsonlPath) : 0;
  if (latestMtime <= currentMtime) return false;

  const latestSessionId = path.basename(latestJsonl, '.jsonl');
  const alreadyTracked = [...activeSessions.entries()].some(
    ([id, s]) => id !== sessionId && s.jsonlPath === latestJsonl
  );
  if (alreadyTracked) return false;

  unwatchJsonl(sessionId);
  activeSessions.delete(sessionId);

  session.sessionId = latestSessionId;
  session.jsonlPath = latestJsonl;
  session.lastOffset = 0;
  session.firstPrompt = '';
  session.lastPrompt = '';
  session.tokens = { totalInput: 0, totalOutput: 0 };
  session.toolCallCount = 0;
  session.model = null;
  session.lastRecordHint = null;
  session.lastToolName = null;
  session.lastToolInput = null;

  activeSessions.set(latestSessionId, session);
  parseAndUpdate(latestSessionId);
  watchJsonl(latestSessionId, latestJsonl);
  return true;
}

function watchJsonl(sessionId, jsonlPath) {
  if (jsonlWatchers.has(sessionId)) return;

  const watcher = chokidar.watch(jsonlPath, {
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('change', () => {
    debouncedParse(sessionId);
  });

  jsonlWatchers.set(sessionId, watcher);
}

function unwatchJsonl(sessionId) {
  const watcher = jsonlWatchers.get(sessionId);
  if (watcher) {
    watcher.close();
    jsonlWatchers.delete(sessionId);
  }
  const timer = debounceTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(sessionId);
  }
}

function debouncedParse(sessionId) {
  const existing = debounceTimers.get(sessionId);
  if (existing) clearTimeout(existing);

  debounceTimers.set(sessionId, setTimeout(async () => {
    debounceTimers.delete(sessionId);
    await parseAndUpdate(sessionId);
  }, DEBOUNCE_MS));
}

async function parseAndUpdate(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.jsonlPath) return;

  try {
    if (!fs.existsSync(session.jsonlPath)) return;

    const { state, newOffset } = await parseSessionIncremental(
      session.jsonlPath,
      session.lastOffset,
      session.lastOffset > 0 ? {
        sessionId: session.sessionId,
        model: session.model,
        startedAt: session.startedAt,
        endedAt: null,
        firstPrompt: session.firstPrompt,
        lastPrompt: session.lastPrompt,
        tokens: { ...session.tokens },
        toolCallCount: session.toolCallCount,
      } : null
    );

    session.lastOffset = newOffset;
    if (state.model) session.model = state.model;
    if (state.firstPrompt) session.firstPrompt = state.firstPrompt;
    if (state.lastPrompt) session.lastPrompt = state.lastPrompt;
    session.tokens = state.tokens;
    session.toolCallCount = state.toolCallCount || 0;
    if (state.startedAt && !session.startedAt) session.startedAt = state.startedAt;
    if (state.lastRecordHint) session.lastRecordHint = state.lastRecordHint;
    if (state.lastToolName) session.lastToolName = state.lastToolName;
    if (state.lastToolInput) session.lastToolInput = state.lastToolInput;

    session.lastActivity = getFileMtime(session.jsonlPath);
    const timeSince = Date.now() - session.lastActivity;
    session.status = timeSince > IDLE_THRESHOLD_MS ? 'idle' : 'active';

    broadcast('update', toClientData(session));
  } catch { /* skip parse errors */ }
}

function pollSessionStatus() {
  const now = Date.now();

  rescanSessionFiles();

  for (const [sessionId, session] of activeSessions) {
    const pidAlive = isProcessRunning(session.pid);
    const lastAct = session.jsonlPath ? getFileMtime(session.jsonlPath) : session.lastActivity;
    const timeSinceActivity = now - lastAct;

    if (session.status === 'completed') {
      if (pidAlive && tryUpgradeJsonl(sessionId, session)) {
        reactivateSession(session);
      } else if (pidAlive && session.jsonlPath) {
        const newMtime = getFileMtime(session.jsonlPath);
        if (newMtime > session.lastActivity) {
          reactivateSession(session);
        }
      }
      continue;
    }

    if (!pidAlive) {
      markCompleted(sessionId);
      continue;
    }

    const sessionFile = path.join(SESSIONS_DIR, `${session.pid}.json`);
    const sessionFileExists = fs.existsSync(sessionFile);
    if (!sessionFileExists && timeSinceActivity > IDLE_THRESHOLD_MS) {
      markCompleted(sessionId);
      continue;
    }

    if (sessionFileExists && timeSinceActivity > ZOMBIE_SESSION_MS) {
      const sessionFileMtime = getFileMtime(sessionFile);
      if (now - sessionFileMtime > ZOMBIE_SESSION_MS) {
        markCompleted(sessionId);
        continue;
      }
    }

    if (timeSinceActivity > IDLE_THRESHOLD_MS) {
      tryUpgradeJsonl(sessionId, session);
    }

    if (session.jsonlPath) {
      const newMtime = getFileMtime(session.jsonlPath);
      if (newMtime > session.lastActivity) {
        debouncedParse(sessionId);
      }
    }

    const recalcAct = session.jsonlPath ? getFileMtime(session.jsonlPath) : session.lastActivity;
    const newStatus = (now - recalcAct) > IDLE_THRESHOLD_MS ? 'idle' : 'active';
    if (session.status !== newStatus) {
      session.status = newStatus;
      broadcast('update', toClientData(session));
    }

    if (!session.jsonlPath) {
      const jsonlPath = findJsonlPath(session.projectDir, sessionId);
      if (jsonlPath) {
        session.jsonlPath = jsonlPath;
        parseAndUpdate(sessionId);
        watchJsonl(sessionId, jsonlPath);
      }
    }
  }
}

function rescanSessionFiles() {
  let files;
  try { files = fs.readdirSync(SESSIONS_DIR); }
  catch { return; }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const fp = path.join(SESSIONS_DIR, file);
    let content;
    try { content = JSON.parse(fs.readFileSync(fp, 'utf-8')); }
    catch { continue; }

    const { sessionId } = content;
    if (!sessionId || activeSessions.has(sessionId)) continue;

    handleSessionFile(fp);
  }
}

function findProjectDir(cwd) {
  if (!cwd) return null;
  const normalized = cwd.replace(/\\/g, '/');

  for (const [dirName, info] of projectCache) {
    if (info.path && info.path.replace(/\\/g, '/') === normalized) {
      return dirName;
    }
  }

  try {
    const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
      try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory(); }
      catch { return false; }
    });
    for (const dir of dirs) {
      const decoded = dir.replace(/^([A-Z])-/, '$1:').replace(/-/g, '/');
      if (decoded === normalized || decoded === cwd.replace(/\\/g, '/')) {
        return dir;
      }
    }
  } catch { /* skip */ }

  return null;
}

function findJsonlPath(projectDir, sessionId) {
  if (!projectDir) {
    try {
      const dirs = fs.readdirSync(PROJECTS_DIR);
      for (const dir of dirs) {
        const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* skip */ }
    return null;
  }
  const candidate = path.join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch { /* skip */ }
  return null;
}

function findLatestJsonlInProject(projectDir) {
  if (!projectDir) return null;
  const dirPath = path.join(PROJECTS_DIR, projectDir);
  try {
    const files = fs.readdirSync(dirPath).filter(
      (f) => f.endsWith('.jsonl') && !f.startsWith('agent-')
    );
    if (files.length === 0) return null;

    let latest = null;
    let latestMtime = 0;
    for (const file of files) {
      const fp = path.join(dirPath, file);
      const mtime = fs.statSync(fp).mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latest = fp;
      }
    }
    return latest;
  } catch { return null; }
}

function getFileMtime(filePath) {
  try { return fs.statSync(filePath).mtimeMs; }
  catch { return Date.now(); }
}

function extractLastSegment(str) {
  if (!str) return 'unknown';
  const normalized = str.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'unknown';
}

function toClientData(session) {
  return {
    sessionId: session.sessionId,
    pid: session.pid,
    projectDir: session.projectDir,
    projectLabel: session.projectLabel,
    status: session.status,
    activityHint: session.lastRecordHint || null,
    lastToolName: session.lastToolName || null,
    lastToolInput: session.lastToolInput || null,
    startedAt: session.startedAt,
    firstPrompt: session.firstPrompt,
    lastPrompt: session.lastPrompt,
    lastActivity: session.lastActivity,
    tokens: session.tokens,
    toolCallCount: session.toolCallCount,
    model: session.model,
  };
}

export function getMonitorSnapshot() {
  return [...activeSessions.values()].map(toClientData);
}

export function addSSEClient(res) {
  sseClients.add(res);
}

export function removeSSEClient(res) {
  sseClients.delete(res);
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}
