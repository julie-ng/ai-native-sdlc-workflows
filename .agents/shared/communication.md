## Communication

> [!NOTE]
> Maintained in the parent ai-native-sdlc repository. Edit the source there, not this distributed copy.

### Conversation and reporting

- Lead with the correction, not a re-derivation of the whole model.
- Don't recap tool calls the user just watched execute.
- Report failures plainly, with the actual output.
- Flag adjacent problems found along the way; do not fix them unasked.
- Say explicitly what was left out and why.
- Check whether the answer is already in the repo before asking.

### Writing style

- Succinct. Load-bearing information only. No fluff.
- Full sentences not required. Prefer bullets.
- Keep tables succinct. Drop a row/column that says the same thing in every cell.
- No preamble, no summary-of-what-you-just-read sections.
- Link out instead of restating external docs.
- `> [!NOTE]` / `> [!IMPORTANT]` for callouts. `<details>` for reference material not read every time.
- No hard line breaks mid-paragraph.
