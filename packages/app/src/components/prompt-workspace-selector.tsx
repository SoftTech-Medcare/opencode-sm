import { For, Show } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"

export function PromptWorkspaceSelector(props: {
  value: string
  projectRoot: string
  workspaces: string[]
  branch?: string
  repos: { dir: string; branch?: string }[]
  selectedDir?: string
  onSelect?: (value: string) => void
  onChange: (value: string) => void
  onDone: () => void
}) {
  const language = useLanguage()
  let pending: string | undefined
  const selected = () => (props.value === props.projectRoot ? "main" : props.value)
  const icon = () => {
    if (selected() === "main") return "monitor"
    if (selected() === "create") return "workspace-new"
    return "workspace"
  }
  const select = (value: string) => {
    pending = value
  }
  const onOpenChange = (open: boolean) => {
    if (open) return
    const value = pending
    pending = undefined
    if (value) props.onChange(value)
    props.onDone()
  }
  const label = () => {
    if (selected() === "main") return language.t("session.new.workspace.triggerLocal")
    if (props.value === "create") return language.t("workspace.new")
    return getFilename(props.value)
  }

  return (
    <>
      <span class="hidden select-none opacity-50 sm:inline mx-1">/</span>
      <MenuV2 placement="bottom" gutter={4} onOpenChange={onOpenChange}>
        <MenuV2.Trigger class="flex h-7 min-w-0 max-w-[203px] items-center gap-1.5 rounded-sm px-1.5 hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-pressed data-[expanded]:text-v2-text-text-muted">
          <IconV2 name={icon()} class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate">{label()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        </MenuV2.Trigger>
        <MenuV2.Portal>
          <MenuV2.Content class="w-[180px]">
            <MenuV2.Group>
              <MenuV2.GroupLabel>{language.t("session.new.workspace.runIn")}</MenuV2.GroupLabel>
              <MenuV2.Item onSelect={() => select("main")}>
                <IconV2 name="monitor" />
                <span class="min-w-0 flex-1 truncate">{language.t("session.new.workspace.local")}</span>
                <Show when={selected() === "main"}>
                  <Icon name="check" size="small" class="shrink-0" />
                </Show>
              </MenuV2.Item>
              <MenuV2.Item onSelect={() => select("create")}>
                <IconV2 name="workspace-new" />
                <span class="min-w-0 flex-1 truncate">{language.t("workspace.new")}</span>
                <Show when={selected() === "create"}>
                  <Icon name="check" size="small" class="shrink-0" />
                </Show>
              </MenuV2.Item>
            </MenuV2.Group>
            <Show when={props.workspaces.length > 0}>
              <MenuV2.Separator />
              <MenuV2.Sub gutter={0} overlap overflowPadding={8}>
                <MenuV2.SubTrigger>
                  <IconV2 name="workspace" />
                  {language.t("session.new.workspace.existing")}
                </MenuV2.SubTrigger>
                <MenuV2.Portal>
                  <MenuV2.SubContent class="max-w-[200px]">
                    <For each={props.workspaces}>
                      {(workspace) => (
                        <MenuV2.Item onSelect={() => select(workspace)}>
                          <IconV2 name="workspace-isolated" />
                          <span class="min-w-0 flex-1 truncate">{getFilename(workspace)}</span>
                          <Show when={selected() === workspace}>
                            <Icon name="check" size="small" class="shrink-0" />
                          </Show>
                        </MenuV2.Item>
                      )}
                    </For>
                  </MenuV2.SubContent>
                </MenuV2.Portal>
              </MenuV2.Sub>
            </Show>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
      <PromptGitStatus
        repos={props.repos}
        branch={props.branch}
        selectedDir={props.selectedDir}
        onSelect={props.onSelect ?? props.onChange}
        onDone={props.onDone}
      />
    </>
  )
}

export function PromptGitStatus(props: {
  repos: { dir: string; branch?: string }[]
  branch?: string
  noGit?: boolean
  selectedDir?: string
  onSelect?: (value: string) => void
  onDone?: () => void
}) {
  const language = useLanguage()
  const count = props.repos.length

  const single = () => {
    if (props.noGit) return language.t("session.new.git.none")
    if (count === 0) return undefined
    return props.repos[0].branch
  }
  const multiLabel = () => (props.noGit ? language.t("session.new.git.none") : language.plural("session.new.git.repo", count))

  if (count <= 1) {
    return (
      <Show when={single()}>
        {(value) => (
          <>
            <span class="hidden select-none opacity-50 sm:inline mx-1">/</span>
            <TooltipV2
              placement="top"
              value={value()}
              class="min-w-0 max-w-[220px]"
              contentClass="max-w-[calc(100vw-32px)] break-all"
            >
              <div class="flex h-7 min-w-0 max-w-[220px] items-center gap-1.5 px-2 text-[13px] font-[440] leading-5 tracking-[-0.04px]">
                <Icon name="branch" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                <span class="min-w-0 truncate">{value()}</span>
              </div>
            </TooltipV2>
          </>
        )}
      </Show>
    )
  }

  const onOpenChange = (open: boolean) => {
    if (!open) props.onDone?.()
  }

  return (
    <>
      <span class="hidden select-none opacity-50 sm:inline mx-1">/</span>
      <MenuV2 placement="bottom" gutter={4} onOpenChange={onOpenChange}>
        <MenuV2.Trigger class="flex h-7 min-w-0 max-w-[220px] items-center gap-1.5 rounded-sm px-1.5 hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-pressed data-[expanded]:text-v2-text-text-muted">
          <Icon name="branch" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate">{multiLabel()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        </MenuV2.Trigger>
        <MenuV2.Portal>
          <MenuV2.Content class="w-[220px]">
            <MenuV2.Group>
              <MenuV2.GroupLabel>{language.t("session.new.git.repos")}</MenuV2.GroupLabel>
              <For each={props.repos}>
                {(repo, index) => (
                  <MenuV2.Item
                    style={{
                      height: "auto",
                      padding: "6px 12px",
                      marginBottom: "2px",
                      ...(index() === 0 ? { marginTop: "2px" } : {}),
                    }}
                    onSelect={() => props.onSelect?.(repo.dir)}>
                    <span class="min-w-0 flex-1 flex flex-col gap-0">
                      <span class="min-w-0 truncate">{getFilename(repo.dir)}</span>
                      <Show when={repo.branch}>
                        <span class="min-w-0 truncate text-[11px] leading-5 text-v2-text-text-muted">{repo.branch}</span>
                      </Show>
                    </span>
                    <Show when={props.selectedDir === repo.dir}>
                      <Icon name="check" size="small" class="shrink-0" />
                    </Show>
                  </MenuV2.Item>
                )}
              </For>
            </MenuV2.Group>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
    </>
  )
}
