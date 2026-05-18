import fs from 'fs';
import readline from 'readline';
import cacheManager from './cacheManager.js';

export async function readFirstTimestamp(filePath) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let found = false;

    rl.on('line', (line) => {
      if (found) return;
      try {
        const record = JSON.parse(line);
        if (record.timestamp) {
          found = true;
          rl.close();
          stream.destroy();
          resolve(record.timestamp);
        }
      } catch { /* skip */ }
    });

    rl.on('close', () => { if (!found) resolve(null); });
    stream.on('error', () => resolve(null));
  });
}

export async function parseSessionSummary(filePath) {
  const cached = cacheManager.get(filePath);
  if (cached) return cached;

  const summary = await doParse(filePath);
  if (summary) cacheManager.set(filePath, summary);
  return summary;
}

async function doParse(filePath) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const state = {
      sessionId: null,
      startedAt: null,
      endedAt: null,
      model: null,
      version: null,
      firstPrompt: null,
      lastPrompt: null,
      tokens: { totalInput: 0, totalOutput: 0, cacheCreation: 0, cacheRead: 0 },
      toolCalls: [],
      toolUsage: {},
      fileChangeMap: new Map(),
    };

    rl.on('line', (line) => {
      try {
        const record = JSON.parse(line);
        processRecord(record, state);
      } catch { /* skip malformed */ }
    });

    rl.on('close', () => {
      if (!state.startedAt) { resolve(null); return; }
      resolve(buildSummary(state));
    });

    stream.on('error', () => resolve(null));
  });
}

function processRecord(record, state) {
  if (record.timestamp) {
    if (!state.startedAt) state.startedAt = record.timestamp;
    state.endedAt = record.timestamp;
  }
  if (record.sessionId && !state.sessionId) {
    state.sessionId = record.sessionId;
  }
  if (record.version && !state.version) {
    state.version = record.version;
  }

  if (record.type === 'user') {
    processUserRecord(record, state);
  } else if (record.type === 'assistant') {
    processAssistantRecord(record, state);
  }
}

function processUserRecord(record, state) {
  if (record.isMeta) return;

  const text = extractUserText(record.message?.content);
  if (!text) return;

  if (!state.firstPrompt) state.firstPrompt = text.substring(0, 200);
  state.lastPrompt = text.substring(0, 200);
}

function extractUserText(content) {
  if (typeof content === 'string') {
    if (content.startsWith('<command-') || content.startsWith('<local-command')) return null;
    const cleaned = content.replace(/<[^>]+>/g, '').trim();
    return cleaned || null;
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text' && item.text && !item.text.startsWith('<')) {
        return item.text.trim();
      }
    }
  }
  return null;
}

function processAssistantRecord(record, state) {
  const msg = record.message;
  if (!msg) return;

  if (msg.model && !state.model) state.model = msg.model;

  if (msg.usage) {
    state.tokens.totalInput += msg.usage.input_tokens || 0;
    state.tokens.totalOutput += msg.usage.output_tokens || 0;
    state.tokens.cacheCreation += msg.usage.cache_creation_input_tokens || 0;
    state.tokens.cacheRead += msg.usage.cache_read_input_tokens || 0;
  }

  if (!Array.isArray(msg.content)) return;

  for (const block of msg.content) {
    if (block.type !== 'tool_use') continue;
    processToolUse(block, record.timestamp, state);
  }
}

function processToolUse(block, timestamp, state) {
  const name = block.name;
  const input = summarizeToolInput(name, block.input);

  state.toolCalls.push({ timestamp, name, input, toolUseId: block.id });
  state.toolUsage[name] = (state.toolUsage[name] || 0) + 1;

  if (name === 'Write' && block.input?.file_path) {
    state.fileChangeMap.set(block.input.file_path, 'created');
  } else if (name === 'Edit' && block.input?.file_path) {
    if (!state.fileChangeMap.has(block.input.file_path)) {
      state.fileChangeMap.set(block.input.file_path, 'modified');
    }
  }
}

function summarizeToolInput(name, input) {
  if (!input) return '';
  if (name === 'Bash') return input.command || '';
  if (name === 'Write' || name === 'Edit' || name === 'Read') return input.file_path || '';
  if (name === 'Grep') return input.pattern || '';
  if (name === 'Glob') return input.pattern || '';
  return JSON.stringify(input).substring(0, 100);
}

export async function parseSessionIncremental(filePath, fromOffset, existingState) {
  const fileSize = fs.statSync(filePath).size;
  if (fileSize <= fromOffset) {
    return { state: existingState, newOffset: fromOffset };
  }

  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { start: fromOffset, encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const state = existingState || {
      sessionId: null,
      model: null,
      startedAt: null,
      endedAt: null,
      firstPrompt: null,
      lastPrompt: null,
      tokens: { totalInput: 0, totalOutput: 0 },
      toolCallCount: 0,
    };

    let bytesRead = fromOffset;
    let isFirstLine = fromOffset > 0;

    rl.on('line', (line) => {
      bytesRead += Buffer.byteLength(line, 'utf-8') + 1;
      if (isFirstLine && fromOffset > 0) {
        isFirstLine = false;
      }
      try {
        const record = JSON.parse(line);
        processRecordLive(record, state);
      } catch { /* skip */ }
    });

    rl.on('close', () => {
      resolve({ state, newOffset: fileSize });
    });

    stream.on('error', () => {
      resolve({ state: existingState, newOffset: fromOffset });
    });
  });
}

function processRecordLive(record, state) {
  if (record.timestamp) {
    if (!state.startedAt) state.startedAt = record.timestamp;
    state.endedAt = record.timestamp;
  }
  if (record.sessionId && !state.sessionId) state.sessionId = record.sessionId;

  if (record.type === 'user' && !record.isMeta) {
    processUserRecord(record, state);
    state.lastRecordHint = 'user_input';
  } else if (record.type === 'assistant') {
    const msg = record.message;
    if (!msg) return;
    if (msg.model && !state.model) state.model = msg.model;
    if (msg.usage) {
      state.tokens.totalInput += msg.usage.input_tokens || 0;
      state.tokens.totalOutput += msg.usage.output_tokens || 0;
    }
    const toolUseBlocks = Array.isArray(msg.content) ? msg.content.filter(b => b.type === 'tool_use') : [];
    if (toolUseBlocks.length > 0) {
      for (const block of toolUseBlocks) {
        state.toolCallCount = (state.toolCallCount || 0) + 1;
      }
      const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
      state.lastRecordHint = 'tool_use';
      state.lastToolName = lastTool.name || null;
      state.lastToolInput = summarizeToolInput(lastTool.name, lastTool.input) || null;
    } else {
      state.lastRecordHint = 'assistant_end';
    }
  } else if (record.type === 'system') {
    if (record.subtype === 'turn_duration' || record.subtype === 'stop_hook_summary') {
      state.lastRecordHint = 'turn_ended';
      state.lastToolName = null;
      state.lastToolInput = null;
    }
  }
}

function buildSummary(state) {
  const filesChanged = [];
  for (const [filePath, action] of state.fileChangeMap) {
    filesChanged.push({ path: filePath, action });
  }

  return {
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    model: state.model,
    version: state.version,
    firstPrompt: state.firstPrompt || '',
    lastPrompt: state.lastPrompt || '',
    tokens: state.tokens,
    toolCalls: state.toolCalls,
    toolUsage: state.toolUsage,
    filesChanged,
  };
}
