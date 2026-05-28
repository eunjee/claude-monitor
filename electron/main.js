const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const SERVER_PORT = 3001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_ENTRY = path.join(__dirname, '..', 'server', 'src', 'index.js');

let serverProcess = null;
let win = null;

// Express 백엔드를 Electron 의 Node 런타임으로 자식 프로세스 실행
function startServer() {
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    console.log(`[server] exited with code ${code}`);
  });
}

// 서버가 응답할 때까지 대기
function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const req = http.get(`${SERVER_URL}/api/projects`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (left <= 0) return reject(new Error('서버 시작 실패'));
        setTimeout(() => tryOnce(left - 1), 500);
      });
    };
    tryOnce(retries);
  });
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 360;
  const height = 620;

  win = new BrowserWindow({
    width,
    height,
    // 화면 우측 상단에 배치
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 16,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: '세션 모니터',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.loadURL(`${SERVER_URL}/widget`);

  win.on('closed', () => { win = null; });
}

ipcMain.on('widget:close', () => {
  if (win) win.close();
});

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (e) {
    console.error(e.message);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// 앱 종료 시 백엔드도 함께 종료
app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});
