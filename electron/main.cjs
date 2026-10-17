const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let backendProcess;

function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(__dirname, "..", "backend");

  const python = process.platform === "win32" ? "python" : "python3";

  backendProcess = spawn(
    python,
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: backendDir,
      windowsHide: true,
      stdio: "ignore"
    }
  );

  backendProcess.on("error", err => {
    console.error("Could not start Python backend:", err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 950,
    minHeight: 700,
    title: "MolConvertX",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL("http://127.0.0.1:5173");
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select output folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle("select-save-file", async (_event, suggestedName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Choose output file",
    defaultPath: suggestedName || "molecule",
    properties: ["showOverwriteConfirmation"]
  });

  if (result.canceled) return null;
  return result.filePath;
});

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 1200);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
