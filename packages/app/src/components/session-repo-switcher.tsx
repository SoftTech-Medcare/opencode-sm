import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getFilename } from "@opencode-ai/core/util/path"
import { createMemo, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"

export function SessionRepoSwitcher() {
  const navigate = useNavigate()
  const language = useLanguage()
  const serverSync = useServerSync()
  const sdk = useSDK()
  const sync = useSync()

  const dirCount = createMemo(() => {
    const current = sync().project
    if (!current || current.vcs !== "git") return 0
    const dirs = current.directories?.length
      ? current.directories.map((d) => d.directory)
      : (current.sandboxes ?? [])
    return new Set([current.worktree, ...dirs]).size
  })
  const repos = createMemo(() => {
    const current = sync().project
    if (!current) return []
    const dirs = current.directories?.length
      ? current.directories.map((d) => d.directory)
      : (current.sandboxes ?? [])
    return [...new Set([current.worktree, ...dirs])].map((dir) => ({ dir, branch: serverSync().child(dir)[0].vcs?.branch }))
  })
  const selectedDir = () => sdk().directory

  if (dirCount() <= 1) return null

  return (
    <MenuV2 placement="bottom" gutter={4}>
      <MenuV2.Trigger class="flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-border-weak-base bg-surface-panel px-2 text-12-regular text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-pressed">
        <Icon name="branch" size="small" class="shrink-0 text-icon-muted" />
        <span class="min-w-0 truncate">{language.plural("session.header.repositories", dirCount())}</span>
        <Icon name="chevron-down" size="small" class="shrink-0 text-icon-muted" />
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="w-[220px]">
          <MenuV2.Group>
            <MenuV2.GroupLabel>{language.t("session.new.git.repos")}</MenuV2.GroupLabel>
            <For each={repos()}>
              {(repo) => (
                <MenuV2.Item onSelect={() => navigate(`/${base64Encode(repo.dir)}/session`)}>
                  <span class="min-w-0 flex-1 flex flex-col gap-0">
                    <span class="min-w-0 truncate">{getFilename(repo.dir)}</span>
                    <Show when={repo.branch}>
                      <span class="min-w-0 truncate text-[11px] leading-none text-v2-text-text-muted">
                        {repo.branch}
                      </span>
                    </Show>
                  </span>
                  <Show when={selectedDir() === repo.dir}>
                    <Icon name="check" size="small" class="shrink-0" />
                  </Show>
                </MenuV2.Item>
              )}
            </For>
          </MenuV2.Group>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
