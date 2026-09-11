import { contextBridge, ipcRenderer, webUtils } from "electron"
import type { ElectronAPI, WslServersEvent } from "./types"
import type { UpdaterState } from "@opencode-ai/app/updater"
import { invoke, invokeWithTimeout } from "./ipc-timeout"

const updaterCallbacks = new Set<(state: UpdaterState) => void>()
let updaterState: UpdaterState | undefined
let updaterSubscription: Promise<void> | undefined
const updaterHandler = (_: unknown, state: UpdaterState) => {
  updaterState = state
  updaterCallbacks.forEach((callback) => callback(state))
}

const api: ElectronAPI = {
  killSidecar: () => invoke("kill-sidecar"),
  installCli: () => invoke("install-cli"),
  awaitInitialization: () => invokeWithTimeout("await-initialization", [], 300000),
  wslServers: {
    getState: () => invoke("wsl-servers-get-state"),
    subscribe: (cb) => {
      const handler = (_: unknown, event: WslServersEvent) => cb(event)
      ipcRenderer.on("wsl-servers-event", handler)
      void invoke("wsl-servers-subscribe")
      return () => {
        ipcRenderer.removeListener("wsl-servers-event", handler)
        void invoke("wsl-servers-unsubscribe")
      }
    },
    probeRuntime: () => invoke("wsl-servers-probe-runtime"),
    refreshDistros: () => invoke("wsl-servers-refresh-distros"),
    installWsl: () => invokeWithTimeout("wsl-servers-install-wsl", [], 600000),
    installDistro: (name) => invokeWithTimeout("wsl-servers-install-distro", [name], 600000),
    probeAddable: (distros) => invoke("wsl-servers-probe-addable", distros),
    installOpencode: (name) => invokeWithTimeout("wsl-servers-install-opencode", [name], 600000),
    openTerminal: (name) => invoke("wsl-servers-open-terminal", name),
    addServer: (distro) => invoke("wsl-servers-add", distro),
    removeServer: (id) => invoke("wsl-servers-remove", id),
    startServer: (id) => invoke("wsl-servers-start", id),
  },
  updater: {
    subscribe: async (cb) => {
      updaterCallbacks.add(cb)
      if (updaterState) cb(updaterState)
      if (!updaterSubscription) {
        ipcRenderer.on("updater-state", updaterHandler)
        updaterSubscription = invoke("updater-subscribe")
      }
      await updaterSubscription
      return () => {
        updaterCallbacks.delete(cb)
        if (updaterCallbacks.size > 0) return
        ipcRenderer.removeListener("updater-state", updaterHandler)
        updaterSubscription = undefined
        void invoke("updater-unsubscribe")
      }
    },
    check: () => invoke("updater-check"),
    install: () => invoke("updater-install"),
  },
  consumeInitialDeepLinks: () => invoke("consume-initial-deep-links"),
  getDefaultServerUrl: () => invoke("get-default-server-url"),
  setDefaultServerUrl: (url) => invoke("set-default-server-url", url),
  isFirstLaunchOnboardingPending: () => invoke("is-first-launch-onboarding-pending"),
  finishFirstLaunchOnboarding: (createDefaultProject) =>
    invoke("finish-first-launch-onboarding", createDefaultProject),
  isOldLayoutEligible: () => invoke("is-old-layout-eligible"),
  getDisplayBackend: () => invoke("get-display-backend"),
  setDisplayBackend: (backend) => invoke("set-display-backend", backend),
  checkAppExists: (appName) => invoke("check-app-exists", appName),
  resolveAppPath: (appName) => invoke("resolve-app-path", appName),
  storeGet: (name, key) => invoke("store-get", name, key),
  storeSet: (name, key, value) => invoke("store-set", name, key, value),
  storeDelete: (name, key) => invoke("store-delete", name, key),
  storeClear: (name) => invoke("store-clear", name),
  storeKeys: (name) => invoke("store-keys", name),
  storeLength: (name) => invoke("store-length", name),
  draftGet: (key) => invoke("draft-get", key),
  draftSet: (key, value) => invoke("draft-set", key, value),
  draftDelete: (key) => invoke("draft-delete", key),
   draftBlobPut: (data) => invokeWithTimeout("draft-blob-put", [data], 600000),
  draftBlobGet: (id) => invoke("draft-blob-get", id),

  getWindowID: () => invoke("get-window-id"),
  onMenuCommand: (cb) => {
    const handler = (_: unknown, id: string) => cb(id)
    ipcRenderer.on("menu-command", handler)
    return () => ipcRenderer.removeListener("menu-command", handler)
  },
  onDeepLink: (cb) => {
    const handler = (_: unknown, urls: string[]) => cb(urls)
    ipcRenderer.on("deep-link", handler)
    return () => ipcRenderer.removeListener("deep-link", handler)
  },

   openDirectoryPicker: (opts) => invokeWithTimeout("open-directory-picker", [opts], 300000),
   openFilePicker: (opts) => invokeWithTimeout("open-file-picker", [opts], 300000),
  readPickedFile: (token, path) => invoke("read-picked-file", token, path),
  releasePickedFiles: (token) => invoke("release-picked-files", token),
  getPathForFile: (file) => webUtils.getPathForFile(file),
   saveFilePicker: (opts) => invokeWithTimeout("save-file-picker", [opts], 300000),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  openLocalFile: (url) => ipcRenderer.send("open-local-file", url),
  openPath: (path, app) => invoke("open-path", path, app),
  revealPath: (path) => invoke("reveal-path", path),
  readClipboardImage: () => invoke("read-clipboard-image"),
  getWindowFocused: () => invoke("get-window-focused"),
  getWindowFullscreen: () => invoke("get-window-fullscreen"),
  onWindowFullscreenChanged: (cb) => {
    const handler = (_: unknown, fullscreen: boolean) => cb(fullscreen)
    ipcRenderer.on("window-fullscreen-changed", handler)
    return () => ipcRenderer.removeListener("window-fullscreen-changed", handler)
  },
  setWindowFocus: () => invoke("set-window-focus"),
  showWindow: () => invoke("show-window"),
  relaunch: () => ipcRenderer.send("relaunch"),
  getZoomFactor: () => invoke("get-zoom-factor"),
  setZoomFactor: (factor) => invoke("set-zoom-factor", factor),
  getPinchZoomEnabled: () => invoke("get-pinch-zoom-enabled"),
  setPinchZoomEnabled: (enabled) => invoke("set-pinch-zoom-enabled", enabled),
  onPinchZoomEnabledChanged: (cb) => {
    const handler = (_: unknown, enabled: boolean) => cb(enabled)
    ipcRenderer.on("pinch-zoom-enabled-changed", handler)
    return () => ipcRenderer.removeListener("pinch-zoom-enabled-changed", handler)
  },
  onZoomFactorChanged: (cb) => {
    const handler = (_: unknown, factor: number) => cb(factor)
    ipcRenderer.on("zoom-factor-changed", handler)
    return () => ipcRenderer.removeListener("zoom-factor-changed", handler)
  },
  setTitlebar: (theme) => invoke("set-titlebar", theme),
  runDesktopMenuAction: (action) => invoke("run-desktop-menu-action", action),
  setBackgroundColor: (color: string) => invoke("set-background-color", color),
   exportDebugLogs: () => invokeWithTimeout("export-debug-logs", [], 300000),
  setForceFocus: (enabled) => invoke("set-force-focus", enabled),
  recordFatalRendererError: (error) => invoke("record-fatal-renderer-error", error),
  setNativeTranslations: (bundle) => invoke("set-native-translations", bundle),
}

contextBridge.exposeInMainWorld("api", api)
