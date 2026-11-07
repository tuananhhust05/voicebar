# Contributing

Thanks for your interest in Voicebar!

## Setup

- Node.js 22.12+ (see `.nvmrc`), npm 10+
- macOS: Xcode Command Line Tools (for the Swift speech helper)
- Claude Code CLI installed and signed in, for manual testing

```bash
npm install
npm run dev
```

## Workflow

1. Create a branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Keep changes focused. Write or update tests for any logic in `src/main` or `src/shared`.
3. Before pushing, run:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
4. Open a pull request. CI must pass on macOS and Windows.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`docs:`, `test:`, `refactor:`, `chore:`, `ci:`. For example: `feat(stt): add silence timeout setting`.

## Code style

- TypeScript strict mode. No `any` without a comment explaining why.
- Prettier formats, ESLint catches bugs. Don't fight either; adjust the config in a PR if needed.
- One responsibility per module (see the layout in the
  [design spec](docs/superpowers/specs/2026-11-07-desktop-voice-assistant-design.md#31-directory-layout)).
- User-facing strings are in Vietnamese and English.

## Security-sensitive code

Changes to `src/main/claude/args.ts`, the preload API or IPC validation need a
note in the PR describing why the change is safe. See [SECURITY.md](SECURITY.md).
