## Working practices

> [!NOTE]
> Maintained in the parent ai-native-sdlc repository. Edit the source there, not this distributed copy.

### Collaboration and scope

- Default to interactive work with the human architect. An explicit task or GitHub issue defines the scope for independent work. Ask when direction is unclear; do not invent a task or design decision.
- Read the repository's reading order and task-relevant docs and source before proposing changes. Explicitly read applicable nested instructions and linked shared files; do not assume the harness loaded them.
- Keep broadly applicable rules in shared instructions and project-specific rules in the applicable repository or nested `AGENTS.md`. Skills describe procedures and reference those rules instead of duplicating them.
- Keep tasks understandable from their explicit input and repository files, without another checkout, personal memory, or conversation history. Link to platform design and ADRs when they are required context.
- Ask who else writes a shared resource before concurrency bites.

### Verify, don't guess

- Never state a technical claim you have not checked. Read the file, run the command, fetch the doc.
- **Mark unverified claims in the file itself**, not just in chat — otherwise they become settled fact next session.
- Give the mechanism, not "it's handled."
- Don't invent detail to fill a table cell. An empty cell is honest; a plausible guess is not.
- Prefer primary sources. Note the trust tier when it's not obvious: primary/authoritative vs. secondary vs. don't-cite.
- Check examples against installed or pinned versions. When documentation conflicts, inspect the relevant source at that version and cite it.

### Knowledge and decisions

- **The docs are the memory.** Record agreed changes, implementation defaults, tradeoffs and verification limits alongside the implementation as learnings emerge.
- Design docs describe evolving design and current state; ADRs record decisions and reasoning. Flag disagreements to the human architect rather than silently choosing one.
- Distinguish proposals, agreed decisions, implementation defaults and verified findings. Keep reusable, accepted implementation rules in the applicable instructions; link to plans and contracts for detailed schemas and interfaces. Do not promote open proposals into mandatory rules.
- Every doc tracking an evolving design gets a decision log: date/context → decision and reasoning, one row each.
- Write tradeoffs down even once decided — including minor ones. Decisions with the reasoning stripped out are useless later.
- **Don't carry forward unevaluated choices.** If a tool or pattern was inherited rather than chosen, say so rather than presenting it as settled.
- "Goals" are targets, not achieved state. Don't flag the gap between a goal and the documented current setup as a contradiction — **the gap is the work.**

### Security framing

- **Config != boundary.** A mitigation is not a guarantee. Never round one up to the other for a cleaner sentence.
- Only OS-level mechanisms (container, VM, restricted user) claim "boundary." Config-file rules that match command strings are deterrents, not boundaries.
- Before writing "this protects X," ask whether it protects X or merely discourages something.

Two layers, never conflated:

1. **Isolation** — microVMs, containers. Must hold under scrutiny.
2. **Convenience** — session managers, dashboards, worktree UIs. Zero authority to claim isolation it doesn't enforce.

Name which layer a tool operates at. A good answer at layer 2 buys no credibility at layer 1. Flag category errors plainly.

### Experiments

- Narrow, stated question — "does *this specific mechanism* work," not "does this work."
- Go/no-go criteria fixed before running, not vibes after.
- Layered: each layer gets its own go/no-go. Don't bundle steps where a failure would be ambiguous about which part broke.
- Partial success is kept. Layer 2 failing doesn't invalidate Layer 1.
- Update the decision log as you go, not at the end.

### Changes and completion

- Comment non-obvious intent and deliberate omissions. Preserve useful comments and documentation during refactors; flag unclear or stale intent before removing it.
- Run the applicable repository checks and relevant behavioral checks. Verify meaningful behavior, failure paths and authorization constraints; keep exact commands and test locations in project instructions.
- Keep offline checks independent of real credentials and paid model calls. Use real integration checks for claims about persistence, transfers or deployment; do not claim a check happened unless it did. A successful process exit alone does not prove task completion.
- Completion means the requested behavior or documentation is implemented, applicable checks pass, and affected docs reflect the result. Report unavailable checks and remaining limitations plainly.
