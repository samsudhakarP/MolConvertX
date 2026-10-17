const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("molconvertx", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  selectSaveFile: (suggestedName) =>
    ipcRenderer.invoke("select-save-file", suggestedName)
});
