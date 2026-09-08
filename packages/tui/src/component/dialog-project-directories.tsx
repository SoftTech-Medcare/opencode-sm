import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createResource } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useTerminalDimensions as useDims } from "@opentui/solid"
import { abbreviateHome } from "../runtime"
import { useTuiPaths } from "../context/runtime"
import { errorMessage } from "../util/error"
import { useToast } from "../ui/toast"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import type { ProjectDirectories } from "@opencode-ai/sdk/v2"

type ProjectDirectory = ProjectDirectories[number]
type DirectorySelection = { directory: string }

const emptySelection: DirectorySelection = { directory: "" }

export function DialogProjectDirectories(props: { projectID: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const paths = useTuiPaths()
  const toast = useToast()

  const [directories, { refetch }] = createResource(
    () => props.projectID,
    async (projectID) => {
      const result = await sdk.client.project.directories({ projectID }, { throwOnError: true })
      return result.data ?? []
    },
  )

  const primary = createMemo(() => directories()?.find((d) => d.primary))

  const current = createMemo<DirectorySelection | undefined>(() => {
    const directory = primary()?.directory
    return directory ? { directory } : undefined
  })

  async function attach(directory: string) {
    await sdk.client.project.directories2
      .attach({ projectID: props.projectID, body_directory: directory, type: "attached", primary: false })
      .catch((cause) => toast.show({ variant: "error", title: "Failed to add directory", message: errorMessage(cause) }))
    void refetch()
  }

  async function setPrimary(directory: string) {
    await sdk.client.project.directories2
      .primary({ projectID: props.projectID, body_directory: directory })
      .catch((cause) => toast.show({ variant: "error", title: "Failed to set primary directory", message: errorMessage(cause) }))
    void refetch()
  }

  async function remove(directory: string) {
    const confirmed = await DialogConfirm.show(dialog, "Remove directory", `Remove ${directory} from this project?`)
    if (confirmed !== true) return
    await sdk.client.project.directories2
      .detach({ projectID: props.projectID, body_directory: directory })
      .catch((cause) => toast.show({ variant: "error", title: "Failed to remove directory", message: errorMessage(cause) }))
    void refetch()
  }

  function reopen() {
    dialog.replace(() => <DialogProjectDirectories projectID={props.projectID} />)
  }

  async function addDirectory() {
    const value = await DialogPrompt.show(dialog, "Add directory", {
      placeholder: "Absolute path to a folder or git repository",
    })
    if (!value) return
    await attach(value.trim())
    reopen()
  }

  const titleWidth = createMemo(() => Math.max(1, Math.min(116, dimensions().width - 2) - 12))

  const options = createMemo<DialogSelectOption<DirectorySelection>[]>(() => {
    if (directories.loading && !directories()) return [{ title: "Loading project directories…", value: emptySelection }]
    const data = directories()
    if (!data) return []
    if (data.length === 0) return [{ title: "No project directories found", value: emptySelection }]
    const sorted = [...data].toSorted((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1
      return a.directory.localeCompare(b.directory)
    })
    return sorted.map((item) => ({
      title: abbreviateHome(item.directory, paths.home),
      value: { directory: item.directory },
      category: item.primary ? "Primary" : undefined,
      titleWidth: titleWidth(),
      truncateTitle: "left" as const,
    }))
  })

  const errorView = createMemo(() => {
    if (!directories.error || directories()) return
    return (
      <box paddingLeft={4} paddingRight={4}>
        <text fg={theme.error} attributes={TextAttributes.BOLD}>
          Could not load project directories
        </text>
        <text fg={theme.textMuted}>{errorMessage(directories.error)}</text>
      </box>
    )
  })

  return (
    <box minHeight={8}>
      <DialogSelect
        title="Manage directories"
        options={options()}
        current={current()}
        renderFilter
        locked={directories.loading}
        emptyView={errorView()}
        onSelect={() => {}}
        actions={[
          {
            command: "dialog.project_directories.add",
            title: "add",
            onTrigger: () => void addDirectory(),
          },
          {
            command: "dialog.project_directories.make-primary",
            title: "make primary",
            disabled: (option) => !option || option.value.directory === current()?.directory,
            onTrigger: (option) => {
              if (option) void setPrimary(option.value.directory)
            },
          },
          {
            command: "dialog.project_directories.remove",
            title: "remove",
            disabled: (option) => !option || option.value.directory === current()?.directory,
            onTrigger: (option) => {
              if (option) void remove(option.value.directory)
            },
          },
          {
            command: "dialog.project_directories.refresh",
            title: "refresh",
            onTrigger: () => void refetch(),
          },
        ]}
      />
    </box>
  )
}
