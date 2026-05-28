const { contextBridge, ipcRenderer } = require('electron');

// 위젯 화면(WidgetPage)에서 window.electronWidget 으로 접근
contextBridge.exposeInMainWorld('electronWidget', {
  close: () => ipcRenderer.send('widget:close'),
});
