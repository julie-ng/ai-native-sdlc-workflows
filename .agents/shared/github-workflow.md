## Git & GitHub Workflow

> [!NOTE]
> Maintained in the parent ai-native-sdlc repository. Edit the source there, not this distributed copy.

### Agent identity and credentials

- Use the configured agent identity, never the human developer's identity. Sign all commits with the configured agent GPG key, including rewritten commits.
- In a dev container, use the `devcontainer-agent-setup` skill once before committing, pushing, or `gh`/PR work. Setup mechanics belong in that skill; locate mounts through the hosting workspace's local devcontainer configuration and do not copy host-specific paths into repository docs.
- If the skill or agent credentials are unavailable, continue permitted local work and report delivery limitations. Never substitute a personal identity.
- Never print or copy credential values into documentation, commits, issues or PRs.

### Prefer native Git and GitHub CLI

- Prefer native `git` for repository operations and `gh`, authenticated as the configured agent, for GitHub issues, pull requests, and reviews. Avoid GitHub MCP tools and the GitHub connector - which are token inefficient.

### Security and authorization

- Never edit or commit directly on `main` or another protected branch, push to it, or merge into it. Do not change or bypass branch protections.
- Creating task branches and worktrees is authorized. In the configured dev container, signed commits and normal pushes of task changes to the agent's own branch are authorized without further confirmation. Session-specific instructions about pushing take precedence.
- Amends, rebases, squashes, force pushes, and rewriting published history on the agent's own non-protected task branches are allowed and encouraged when they improve history. No additional confirmation is needed. Preserve task changes and use `--force-with-lease` for force pushes; if the lease fails, inspect the remote changes before retrying.
- **Sandbox escalation is pre-authorized for the Git operations allowed here.** Request escalation through the harness when needed, without asking the human to repeat authorization. Repository instructions do not override harness-enforced restrictions.
- Never delete branches outside `agent/`. Ask before deleting any `agent/` branch, locally or remotely; permission to rewrite history is not permission to delete branches.
- Never commit secrets, tokens, or keys. Provider keys arrive at runtime.

### Branch and delivery guidance

- When working on a specific GitHub issue, make sure to move the issue into the ["In Progress"](https://github.com/users/julie-ng/projects/14/views/2) column of the project board.
- The default branch is `main` in the parent repo and all submodules. Fetch `origin/main` before creating a task branch or worktree. Create independent task branches prefixed with `agent/` from that fetched branch, not the current checkout or another task branch.
- Target PRs at `main`. Only stack branches or PRs when explicitly requested; state the dependency before creating them.
- Before review-ready pushes and PR handoffs, fetch `origin/main`. If it has new commits, rebase the task branch onto `origin/main`; do not merge `main` into the task branch.
- Resolve rebase conflicts while preserving the intended changes from both branches, sign rewritten commits, and verify the resulting PR diff. When updating an already-pushed branch, use `--force-with-lease`; if the lease fails, inspect the remote changes before retrying.
- Resolve routine conflicts without asking the human. For numerous or complex conflicts, use judgment: pause and ask for context when the intended result is unclear or resolution requires a design decision. Conflict count alone is not a reason to stop.
- After a prerequisite PR merges, retarget dependent PRs to `main` and verify their base, commits, and diff before requesting branch cleanup.
- Use a worktree for unattended feature work or when another agent is working in the repository; interactive sessions may use the current checkout when it is not shared. Establish ownership before concurrent writes. Do not modify another agent's checkout or task branch.
- Commit completed, coherent changes at meaningful checkpoints, before handoff or switching tasks, without waiting to be asked. Prefer small, atomic Conventional Commits (`type(scope): description`); do not commit every conversational edit.
- Push at review-ready milestones, handoffs, or session end when authorized; do not push every intermediate commit. Report whether work is uncommitted, committed locally, or pushed, and explain any deferred push.

### Responding to review comments

- Pushing a fix is not a response. Reply to every review comment you act on or decline.
- Reply in the comment's own thread, not in a new PR comment: `gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies -f body=...`. Answer general PR comments in the PR conversation.
- Say what changed and in which commit, or why you made no change. Answer the reviewer's question if they asked one.
- Resolve the thread after replying when your change fully addresses it (GraphQL `resolveReviewThread`). Leave it open when you declined, disagree or need input.
