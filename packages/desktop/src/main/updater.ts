import { app, dialog } from "electron"
import { existsSync, statSync } from "node:fs"
import pkg from "electron-updater"
import { UPDATER_ENABLED } from "./constants"
import { createUpdaterController, type UpdaterReadyRecord } from "./updater-controller"
import { getLogger } from "./logging"
import { getStore } from "./store"
import { setAppQuitting } from "./windows"
import { nativeT } from "./native-translations"

const { autoUpdater } = pkg
const key = "ready"

export function setupAutoUpdater(stop: () => Promise<void>) {
  const logger = getLogger()
  autoUpdater.logger = logger
  autoUpdater.channel = "latest"
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  logger.log("auto updater configured", {
    channel: autoUpdater.channel,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade,
    currentVersion: app.getVersion(),
  })

  let updateDownloadPath = ""
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloadPath = info.path
    logger.log("update downloaded", { path: info.path, version: info.version })
  })

  const store = getStore("opencode.updater")
  return createUpdaterController({
    enabled: UPDATER_ENABLED,
    currentVersion: app.getVersion(),
    backend: {
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      downloadUpdate: async () => {
        updateDownloadPath = ""
        await autoUpdater.downloadUpdate()
        // Verify download integrity: check the downloaded update file exists
        // and has a reasonable size (>0 bytes).
        if (updateDownloadPath) {
          try {
            const stats = statSync(updateDownloadPath)
            if (stats.size === 0) {
              throw new Error("Downloaded update file is empty")
            }
            logger.log("update download verified", { path: updateDownloadPath, size: stats.size })
          } catch (error) {
            logger.error("update download verification failed", { path: updateDownloadPath, error })
            throw error
          }
        }
      },
      quitAndInstall: () => {
        setAppQuitting()
        try {
          autoUpdater.quitAndInstall()
        } catch (error) {
          setAppQuitting(false)
          throw error
        }
      },
      rollback: async () => {
        // Rollback to the previous version by allowing downgrade
        // and checking for the previous version.
        logger.log("rolling back to previous version")
        autoUpdater.allowDowngrade = true
        try {
          await autoUpdater.checkForUpdates()
        } finally {
          autoUpdater.allowDowngrade = false
        }
      },
    },
    persistence: {
      get() {
        const value = store.get(key)
        if (!value || typeof value !== "object" || !("version" in value) || typeof value.version !== "string") return
        return { version: value.version } satisfies UpdaterReadyRecord
      },
      set: (value) => store.set(key, value),
      clear: () => store.delete(key),
    },
    stop,
    log: (message, data) => logger.log(message, data),
  })
}

export async function showUpdaterDialog(controller: ReturnType<typeof setupAutoUpdater>, alertOnFail: boolean) {
  const state = await controller.check()
  if (state.status === "error") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "error",
      message: nativeT("desktop.updater.dialog.checkFailed.message"),
      title: nativeT("desktop.updater.dialog.checkFailed.title"),
    })
    return
  }
  if (state.status === "up-to-date") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "info",
      message: nativeT("desktop.updater.dialog.upToDate.message"),
      title: nativeT("desktop.updater.dialog.upToDate.title"),
    })
    return
  }
  if (state.status !== "ready") return

  const response = await dialog.showMessageBox({
    type: "info",
    message: nativeT("desktop.updater.dialog.ready.message", { version: state.version }),
    title: nativeT("desktop.updater.dialog.ready.title"),
    buttons: [nativeT("desktop.updater.dialog.restart"), nativeT("desktop.updater.dialog.later")],
    defaultId: 0,
    cancelId: 1,
  })
  if (response.response === 0) await controller.install()
}
