import fs from 'fs';
import path from 'path';
import readline from 'readline';

export async function extractCwdFromJsonl(filePath) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let found = false;

    rl.on('line', (line) => {
      if (found) return;
      try {
        const record = JSON.parse(line);
        if (record.cwd) {
          found = true;
          rl.close();
          stream.destroy();
          resolve(record.cwd);
        }
      } catch {
        // skip malformed lines
      }
    });

    rl.on('close', () => {
      if (!found) resolve(null);
    });

    stream.on('error', () => resolve(null));
  });
}

export function extractProjectLabel(projectPath) {
  if (!projectPath) return null;
  const normalized = projectPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
}

export function labelFromDirName(dirName) {
  const parts = dirName.split('-').filter(Boolean);
  if (parts.length <= 1) return dirName;
  return parts[parts.length - 1];
}

export async function resolveProjectPath(projectDir, claudeProjectsDir) {
  const dirPath = path.join(claudeProjectsDir, projectDir);
  const files = fs.readdirSync(dirPath).filter(
    (f) => f.endsWith('.jsonl') && !f.startsWith('agent-')
  );

  for (const file of files) {
    const cwd = await extractCwdFromJsonl(path.join(dirPath, file));
    if (cwd) return cwd;
  }
  return null;
}
