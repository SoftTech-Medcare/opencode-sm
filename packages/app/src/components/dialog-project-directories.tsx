import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTitleGroup,
} from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobal } from "@/context/global"
import { useServerSync } from "@/context/server-sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { type ProjectDirectory, type ProjectDirectoryType } from "@opencode-ai/sdk/v2"
import { ServerConnection } from "@/context/server"
import { useDirectoryPicker } from "./directory-picker"
import { showToast } from "@/utils/toast"

const MIN_WIDTH = 440
const MIN_HEIGHT = 320
const NARROW_WIDTH = 480
const MAX_WIDTH = 980
const MAX_HEIGHT = 600

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)
}

export function DialogProjectDirectories(props: {
  projectID?: string
  workspaceID?: string
  server: ServerConnection.Any
}) {
  const language = useLanguage()
  const global = useGlobal()
  const serverSync = useServerSync()
  const dialog = useDialog()
  const openDirectory = useDirectoryPicker()
  const serverCtx = createMemo(() => global.ensureServerCtx(props.server))
  const [filterInputEl, setFilterInputEl] = createSignal<HTMLInputElement | undefined>()

  const [size, setSize] = createSignal({ width: MAX_WIDTH, height: MAX_HEIGHT })
  const [dragging, setDragging] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [activeIndex, setActiveIndex] = createSignal(0)
  const [confirmOpen, setConfirmOpen] = createSignal(false)
  const [addedPath, setAddedPath] = createSignal<string | undefined>()
  const [userResized, setUserResized] = createSignal(false)

  // Resolve workspace ID: use provided workspaceID, or create/find one for the project
  const [resolvedWorkspaceID, setResolvedWorkspaceID] = createSignal<string | undefined>(props.workspaceID)
  const [useProjectAPI, setUseProjectAPI] = createSignal(false)

  createEffect(() => {
    if (props.workspaceID) {
      setResolvedWorkspaceID(props.workspaceID)
      setUseProjectAPI(false)
      return
    }
    if (!props.projectID) return

    ;(async () => {
      try {
        // Check if a workspace already exists for this project
        const workspaces = await serverCtx().sdk.client.experimental.workspace.list({}, { throwOnError: true })

        // Find a workspace for this project (local workspaces have no branch)
        const existing = (workspaces.data ?? []).find(
          (ws) => ws.projectID === props.projectID && !ws.branch
        )

        if (existing) {
          setResolvedWorkspaceID(existing.id)
          setUseProjectAPI(false)
          return
        }

        // Create an implicit worktree workspace for this project
        const created = await serverCtx().sdk.client.experimental.workspace.create({
          type: "worktree",
          branch: null,
        }, { throwOnError: true })

        setResolvedWorkspaceID(created.data.id)
        setUseProjectAPI(false)
      } catch (error) {
        // If workspace creation fails (e.g., not a git project), fall back to project directories API
        setUseProjectAPI(true)
      }
    })()
  })

  const [refreshKey, setRefreshKey] = createSignal(0)

  const [workspaceResolved, setWorkspaceResolved] = createSignal(false)

  const [directories, { refetch }] = createResource(
    () => ({
      workspaceID: resolvedWorkspaceID(),
      projectID: props.projectID,
      useProjectAPI: useProjectAPI(),
      resolved: workspaceResolved(),
      key: refreshKey(),
    }),
    async (ids) => {
      // Wait until workspace resolution is complete
      if (!ids.resolved) return []

      if (ids.useProjectAPI && ids.projectID) {
        const result = await serverCtx().sdk.client.project.directories({ projectID: ids.projectID }, { throwOnError: true })
        return result.data ?? []
      }
      if (ids.workspaceID) {
        const result = await serverCtx().sdk.client.experimental.directories.list({
          workspaceID: ids.workspaceID,
        }, { throwOnError: true })
        // Map workspace directories to ProjectDirectory type
        return (result.data ?? []).map((dir) => ({
          ...dir,
          type: (dir.primary ? "main" : "attached") as ProjectDirectoryType,
        }))
      }
      return []
    },
  )

  function triggerRefresh() {
    setRefreshKey((k) => k + 1)
  }

  async function updateProjectStore() {
    if (!props.projectID) return
    try {
      const result = await serverCtx().sdk.client.project.directories({ projectID: props.projectID }, { throwOnError: true })
      const updatedDirs = result.data ?? []

      // Update the global store's project entry
      const syncCtx = serverSync()
      const projects = syncCtx.data.project
      const index = projects.findIndex((p) => p.id === props.projectID)
      if (index !== -1) {
        const updated = [...projects]
        updated[index] = { ...updated[index], directories: updatedDirs }
        syncCtx.set("project", updated)
      }
    } catch (error) {
      console.error("Failed to update project store:", error)
    }
  }

  const filtered = createMemo(() => {
    const list = directories() ?? []
    const q = query().trim().toLowerCase()
    if (!q) return list
    return list.filter((dir) =>
      getFilename(dir.directory).toLowerCase().includes(q) || dir.directory.toLowerCase().includes(q),
    )
  })

  const ordered = createMemo(() => {
    const list = filtered()
    const primaryItem = list.find((dir) => dir.primary)
    const rest = list.filter((dir) => !dir.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })

  const primary = createMemo(() => ordered().find((dir) => dir.primary))
  const attached = createMemo(() => ordered().filter((dir) => !dir.primary))
  const narrow = createMemo(() => size().width < NARROW_WIDTH)

  onMount(() => {
    setUserResized(false)
    setSize(responsiveSize())

    const container = document.querySelector<HTMLElement>("[data-slot=\"dialog-container\"]")
    const observer = new ResizeObserver(() => {
      if (dragging() || userResized()) return
      setSize(responsiveSize())
    })
    if (container) observer.observe(container)

    const onKeydown = (event: KeyboardEvent) => {
      if (confirmOpen()) return
      const target = document.activeElement as HTMLElement | null
      if (target === filterInputEl()) {
        if (event.key === "Escape" || event.key === "Enter") {
          filterInputEl()?.blur()
          event.preventDefault()
        }
        return
      }
      if (target?.closest?.("button, [role=button]")) return
      if (isEditableTarget(target)) return
      const list = ordered()
      if (!list.length) return
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, list.length - 1))
          break
        case "ArrowUp":
          event.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
        case " ":
          event.preventDefault()
          const row = list[activeIndex()]
          if (row && !row.primary) setPrimary(row.directory)
          break
        case "Delete":
        case "Backspace":
          event.preventDefault()
          const removable = list[activeIndex()]
          if (removable && !removable.primary) openConfirm(removable.directory)
          break
        case "a":
        case "A":
          onAddDirectory()
          break
        case "f":
        case "F":
          filterInputEl()?.focus({ preventScroll: true })
          break
      }
    }
    document.addEventListener("keydown", onKeydown)

    return () => {
      observer.disconnect()
      document.removeEventListener("keydown", onKeydown)
    }
  })

  createEffect(() => {
    void directories()
    setActiveIndex(0)
  })

  function clampSize(width: number, height: number, maxWidth = window.innerWidth - 32, maxHeight = window.innerHeight - 32) {
    return {
      width: Math.max(MIN_WIDTH, Math.min(width, maxWidth)),
      height: Math.max(MIN_HEIGHT, Math.min(height, maxHeight)),
    }
  }

  function responsiveSize() {
    return clampSize(window.innerWidth - 32, window.innerHeight - 32, MAX_WIDTH, MAX_HEIGHT)
  }

  function onResizeStart(event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const start = size()
    setDragging(true)
    setUserResized(true)
    document.body.style.userSelect = "none"

    const onMove = (ev: PointerEvent) => {
      setSize(clampSize(start.width + (ev.clientX - startX), start.height + (ev.clientY - startY)))
    }
    const onUp = () => {
      setDragging(false)
      document.body.style.userSelect = ""
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

async function attach(directory: string) {
  if (useProjectAPI() && props.projectID) {
    try {
      await serverCtx().sdk.client.project.directories2.attach({
        projectID: props.projectID,
        body_directory: directory,
        type: "attached",
        primary: false,
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
      return
    }
    setAddedPath(directory)
    window.setTimeout(() => setAddedPath(undefined), 2500)
    triggerRefresh()
    updateProjectStore()
  } else {
    const workspaceID = resolvedWorkspaceID()
    if (!workspaceID) return
    try {
      await serverCtx().sdk.client.experimental.directories.attach({
        workspaceID,
        directory: directory,
        type: "attached",
        primary: false,
      }, { throwOnError: true })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
      return
    }
    setAddedPath(directory)
    window.setTimeout(() => setAddedPath(undefined), 2500)
    triggerRefresh()
    updateProjectStore()
  }
}

  async function setPrimary(directory: string) {
    if (useProjectAPI() && props.projectID) {
      await serverCtx().sdk.client.project.directories2.primary({ projectID: props.projectID, body_directory: directory })
      triggerRefresh()
      updateProjectStore()
    } else {
      const workspaceID = resolvedWorkspaceID()
      if (!workspaceID) return
      await serverCtx().sdk.client.experimental.directories.primary({
        workspaceID,
        directory: directory,
      }, { throwOnError: true })
      triggerRefresh()
    }
  }

  async function remove(directory: string) {
    if (useProjectAPI() && props.projectID) {
      await serverCtx().sdk.client.project.directories2.detach({ projectID: props.projectID, body_directory: directory })
      triggerRefresh()
      updateProjectStore()
    } else {
      const workspaceID = resolvedWorkspaceID()
      if (!workspaceID) return
      await serverCtx().sdk.client.experimental.directories.detach({
        workspaceID,
        directory: directory,
      }, { throwOnError: true })
      triggerRefresh()
    }
  }

  function onAddDirectory() {
    openDirectory({
      server: props.server,
      multiple: false,
      onSelect: (result) => {
        const first = Array.isArray(result) ? result[0] : result
        if (first) attach(first)
      },
    })
  }

  function openConfirm(directory: string) {
    const label = getFilename(directory)
    setConfirmOpen(true)
    dialog.push(
      () => (
        <ConfirmDialog
          label={label}
          onConfirm={async () => {
            await remove(directory)
          }}
        />
      ),
      () => setConfirmOpen(false),
    )
  }

  return (
    <Dialog containerStyle={{ width: `${size().width}px`, height: `${size().height}px` }}>
      <style>{`
        .dp-resize-handle {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          cursor: nwse-resize;
          padding: 3px;
          color: var(--v2-icon-icon-muted);
          opacity: 0;
          transition: opacity 0.12s ease;
          pointer-events: none;
          z-index: 2;
        }
        [data-component="dialog-v2"]:hover .dp-resize-handle,
        .dp-resize-handle:hover {
          opacity: 1;
          pointer-events: auto;
        }
        .dp-row-active {
          background: var(--v2-background-bg-layer-03);
          box-shadow: inset 0 0 0 1px var(--v2-border-border-focus);
        }
        .dp-added {
          animation: dp-flash 2.5s ease-out forwards;
        }
        @keyframes dp-flash {
          0% { background: var(--v2-overlay-simple-overlay-hover); }
          100% { background: transparent; }
        }
      `}</style>
      <div class="dp-resize-handle" onPointerDown={onResizeStart}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 10L10 3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          <path d="M6.5 10L10 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          <path d="M9 10L10 9" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
        </svg>
      </div>

      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("dialog.project.directories.title")}
          description={language.t("dialog.project.directories.description")}
        />
      </DialogHeader>

      <DialogBody class="flex flex-1 flex-col gap-3 px-4 py-3">
        <input
          ref={setFilterInputEl}
          type="text"
          value={query()}
          onChange={(e: Event) => {
            setQuery((e.target as HTMLInputElement).value)
            setActiveIndex(0)
          }}
          placeholder={language.t("dialog.project.directories.filter")}
          aria-label={language.t("dialog.project.directories.filter")}
          class="w-full rounded-md border border-border-weak-base bg-background-base px-2.5 py-1.5 text-sm text-text-base transition-colors hover:bg-background-stronger focus-visible:outline-2 focus-visible:outline-v2-border-border-focus placeholder:text-muted-foreground"
        />

        <Show
          when={ordered().length}
          fallback={
            <div class="text-sm text-muted-foreground">
              <Show when={query()} fallback={language.t("dialog.project.directories.empty")}>
                {language.t("dialog.project.directories.noMatch")}
              </Show>
            </div>
          }
        >
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Show when={primary()}>
            <div>
              <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {language.t("dialog.project.directories.mainFolder")}
              </div>
              <MainRow
                directory={() => primary()!}
                note={language.t("dialog.project.directories.mainNote")}
                active={() => activeIndex() === 0}
              />
            </div>
          </Show>

          <Show when={attached().length}>
            <div>
              <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {language.t("dialog.project.directories.additional", { count: attached().length })}
              </div>
              <div class="flex flex-col gap-1">
                <For each={attached()}>
                  {(dir, index) => {
                    const position = () => (primary() ? index() + 1 : index())
                    return (
                      <AttachedRow
                        directory={dir}
                        active={activeIndex() === position()}
                        narrow={narrow()}
                        recentlyAdded={addedPath() === dir.directory}
                        onActivate={() => setActiveIndex(position())}
                        onMakeMain={() => setPrimary(dir.directory)}
                        onRemove={() => openConfirm(dir.directory)}
                      />
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>
          </div>
        </Show>
      </DialogBody>

      <DialogFooter>
        <ButtonV2 class="w-full" disabled={(useProjectAPI() ? !props.projectID : !resolvedWorkspaceID()) || !directories()} onClick={onAddDirectory}>
          <Icon name="folder-add-left" />
          {language.t("dialog.project.directories.add")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function MainRow(props: { directory: () => ProjectDirectory; note: string; active: () => boolean }) {
  return (
    <div classList={{ "dp-row-active": props.active() }} class="w-full rounded-lg border border-border-strong bg-muted px-3 py-3">
      <div class="flex items-center gap-x-3">
        <FileIcon node={{ path: props.directory().directory, type: "directory" }} class="shrink-0 size-4" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm text-text-strong">{getFilename(props.directory().directory)}</span>
          <span class="truncate text-xs text-muted-foreground" title={props.directory().directory}>{props.directory().directory}</span>
          <Show when={props.directory().role}>
            <span class="text-xs text-muted-foreground capitalize">{props.directory().role}</span>
          </Show>
        </div>
      </div>
      <div class="mt-1.5 text-xs text-muted-foreground">{props.note}</div>
    </div>
  )
}

function AttachedRow(props: {
  directory: ProjectDirectory
  active: boolean
  narrow: boolean
  recentlyAdded: boolean
  onActivate: () => void
  onMakeMain: () => void
  onRemove: () => void
}) {
  const language = useLanguage()
  const dir = props.directory

  return (
    <div
      classList={{ "dp-row-active": props.active, "dp-added": props.recentlyAdded }}
      class="flex w-full items-center gap-x-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted"
      onClick={props.onActivate}
    >
      <FileIcon node={{ path: dir.directory, type: "directory" }} class="shrink-0 size-4" />
      <div class="flex min-w-0 flex-1 items-center gap-x-2">
        <span class="truncate text-sm text-text-strong">{getFilename(dir.directory)}</span>
        <Show when={!props.narrow}>
          <span class="truncate text-xs text-muted-foreground" title={dir.directory}>{dir.directory}</span>
        </Show>
        <Show when={dir.role}>
          <span class="text-xs text-muted-foreground capitalize">{dir.role}</span>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-x-1">
        <ButtonV2
          variant="ghost"
          size="small"
          aria-label={language.t("dialog.project.directories.makeMain")}
          onClick={(e: Event) => {
            e.stopPropagation()
            props.onMakeMain()
          }}
        >
          {language.t("dialog.project.directories.makeMain")}
        </ButtonV2>
        <ButtonV2
          variant="ghost"
          size="small"
          aria-label={language.t("dialog.project.directories.remove")}
          onClick={(e: Event) => {
            e.stopPropagation()
            props.onRemove()
          }}
        >
          {language.t("dialog.project.directories.remove")}
        </ButtonV2>
      </div>
    </div>
  )
}

function ConfirmDialog(props: { label: string; onConfirm: () => void | Promise<void> }) {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <Dialog>
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitle>{language.t("dialog.project.directories.remove.confirm.title")}</DialogTitle>
      </DialogHeader>

      <DialogBody class="px-4 py-3 text-sm text-muted-foreground">
        {language.t("dialog.project.directories.remove.confirm.message", { name: props.label })}
      </DialogBody>

      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          variant="danger"
          defaultAction
          onClick={async () => {
            await props.onConfirm()
            dialog.close()
          }}
        >
          {language.t("dialog.project.directories.remove")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
