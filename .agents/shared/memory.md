## Cross-session memory

> [!NOTE]
> Maintained in the parent ai-native-sdlc repository. Edit the source there, not this distributed copy.

- Personal memory is supplementary. Repository docs and ADRs remain authoritative; verify remembered technical claims against current files and sources, and flag discrepancies.
- At session start, explicitly read the project's Markdown `MEMORY.md` index and task-relevant linked files if available. All harnesses, including Codex, must do this; do not assume memories were loaded automatically or infer their absence from an empty native memory database.
- In a dev container, consult the original workspace's local `.devcontainer/devcontainer.json` to locate the mounted Claude directory, then find the project's `projects/<workspace-path-slug>/memory/` directory. In a task worktree, use the original workspace's memory directory.
- Build on the existing Markdown memory system: save reusable learnings and user preferences there, update existing entries when appropriate, and maintain the `MEMORY.md` index. Keep entries harness-agnostic unless a detail is specific to one harness. Coordinate with other sessions before editing shared memory files.
- If the memory directory is missing or unreadable, report that limitation and continue with repository docs.
