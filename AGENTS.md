# AGENTS.md

## Shared instructions

Read and follow these alongside this repo’s project-specific instructions. Explicit project-specific exceptions override shared defaults; otherwise both apply.

- [Working practices](./.agents/shared/working-practices.md)
- [Communication and writing](./.agents/shared/communication.md)
- [Cross-session memory](./.agents/shared/memory.md)
- [Git & GitHub workflow](./.agents/shared/github-workflow.md)

## TypeScript and JavaScript style

- Always use braces for conditional and loop bodies.
- Put properties on separate lines in multi-property objects and types; expand longer arrays for review. Preserve short, simple lists.
- Run `npm ci` to install development tooling, `npm run lint` to check, and `npm run lint:fix` to apply ESLint style fixes. Runtime scripts remain dependency-free.
