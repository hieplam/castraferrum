# Transcript fixture

Tests for the transcript reader (`server/adapters/transcripts/claude-jsonl/`) use a **real transcript** from Claude Code,
not a hand-made format (D29): the JSONL format is internal to Claude Code and changes between versions, and a hand-made
fixture would drift from the real thing while the tests stay green.

## `haiku-small.jsonl` - 80 KB, 30 lines

- **Source:** one `claude -p` turn with the **haiku** model (`claude-haiku-5-5`), Claude Code **2.1.303**, Windows 11,
  2026-10-19, session `4ecc03da-8197-4041-b5ef-e65c4da7540d`, run in a temp directory holding one `notes.txt` file
  (`alpha beta gamma`):

  ```bash
  echo "Read the file notes.txt, then think carefully: how many ways are there to arrange the 3 words in it so that 'alpha' does not come first? Then list the current directory with ls. Answer briefly in English." \
    | claude -p --model haiku --effort high --output-format json --allowedTools "Read" "Bash(ls:*)" "Glob"
  ```

  Cost 0.0042 USD. The original file was 277 KB / 43 lines at `~/.claude/projects/<directory derived from cwd>/<session>.jsonl`.
  (The recorded run was made with the prompt in Vietnamese; the prompt and reply text in the fixture were translated to
  English afterwards, structure and ids unchanged.)
- **Removed to keep it light and not leak machine information** (13 lines): `attachment` of type `session_context` (contains
  an email), `credential_org`, `instructions` (the user's CLAUDE.md), `prompt_snapshot`, `skill_listing`,
  `deferred_tools_delta`, `mcp_instructions_delta`, `agent_listing_delta`, `remote_session_change`, `environment`;
  `api-request-blob` longer than 4,000 characters. **Every line type of the original file still has at least one line** so
  the tests can filter: `queue-operation` 2, `attachment` 4, `atis-latch` 3, `api-request-shape` 1, `api-request` 2,
  `api-request-blob` 3 (has a conversation-like `message.content` - must still be dropped), `last-prompt` 3, `ai-title` 2,
  `cost-state` 1. The lines that were kept are **byte-for-byte unchanged**.
- **Conversation entries (9)** - tests compare against these numbers: `user` 1 (prompt as a string), `thinking` 2,
  `tool_use` 2 (`Read`, `Bash`), `tool_result` 2 (content as a string), `assistant` 1 (the answer), `system` 1
  (`stop_hook_summary`).
- **Haiku 5.5 thinking is empty**: the `thinking` block has only `signature`, `thinking: ""` (retried with
  `--settings '{"showThinkingSummaries":true,"alwaysThinkingEnabled":true}'`, still empty). So the "thinking is not
  truncated" case builds a long thinking line from **a real assistant line of the fixture**, replacing only the text of the
  `thinking` block.
- There is no array-form `tool_result`, `is_error` or `isSidechain`: those cases live in `claude-line.test.ts` with sample
  lines of the measured shape.

To regenerate: run the command above in a fresh temp directory, copy the session file, then drop the lines as above (keep at
least one line of each type), and update the numbers in the *Conversation entries* section.
