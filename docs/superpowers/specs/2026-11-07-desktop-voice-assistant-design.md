# Voicebar — desktop voice assistant design

- **Date:** 2026-11-07
- **Status:** Approved design, implementation not started
- **Supersedes:** the web prototype in `legacy/web-prototype/` (Express + Docker + host bridge)

## 1. Goal

A menu-bar (macOS) / system-tray (Windows) utility that lets the user ask the
locally installed, already-signed-in **Claude Code CLI** a question by voice,
from anywhere, and hear the answer read aloud by the operating system's voice.
Vietnamese and English are both first-class for speech-in and speech-out.

### Success criteria

1. From any app, pressing the ask shortcut shows the Voicebar window and starts
   listening within 300 ms.
2. After the user stops speaking for the silence timeout (default 1.5 s), the
   text is sent to Claude without any click.
3. The first sentence of the answer starts playing before the full answer has
   arrived (sentence-level streaming TTS).
4. Works with Vietnamese and English on macOS 13+ (Apple Silicon and Intel) and
   Windows 10/11 x64.
5. Claude can never run tools, read files or load MCP servers through Voicebar.

### Non-goals (v1)

- Wake word ("Hey …") detection.
- Linux builds.
- Any Anthropic API key / direct API use. Voicebar only drives the CLI.
- Cloud speech-to-text services.

## 2. Decisions

| Topic          | Decision                                                                | Reason                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell          | Electron 45 + electron-vite, TypeScript 6.0                             | Reuses the prototype's Node streaming logic and UI; tray, global shortcuts and auto-update are built in. TS 6.0 because typescript-eslint supports `<6.1`. |
| Form factor    | Tray/menu-bar app + floating window + global shortcuts                  | "Utility" usage: reachable from anywhere, no Dock clutter.                                                                                                 |
| STT on macOS   | Apple Speech (`SFSpeechRecognizer`) in a bundled Swift helper           | Native, live partial results, vi-VN and en-US.                                                                                                             |
| STT on Windows | `whisper.cpp` (`whisper-cli`) + multilingual `small` model, run locally | The WinRT recognizer's vi-VN support is unconfirmed and needs MSIX identity; Whisper is reliable for both languages and offline.                           |
| TTS            | `speechSynthesis` in the renderer (OS voices)                           | Already works in the prototype; uses "Linh" on macOS and "Microsoft An"/SAPI voices on Windows.                                                            |
| Interaction    | Tap shortcut → listen → auto-send after silence                         | Hands-free. Push-to-talk would need a native keyboard hook (and Accessibility permission on macOS).                                                        |
| License        | MIT                                                                     | Compatible with Electron and whisper.cpp (both MIT).                                                                                                       |

## 3. Architecture

```
┌───────────────────── Electron main process ─────────────────────┐
│ app/      tray, windows, global shortcuts, login item, updater  │
│ claude/   locate CLI → build args → spawn → parse stream-json   │
│ stt/      SttEngine ── AppleSpeechEngine (macOS helper)         │
│                     └─ WhisperEngine (whisper-cli, Windows)     │
│ store/    settings.json, history/<sessionId>.json               │
│ ipc/      typed handlers, input validation                      │
└────────────────────────────▲────────────────────────────────────┘
                             │ contextBridge (preload, typed API)
┌────────────────────────────┴────────────────────────────────────┐
│ renderer/  assistant window, settings window, history list      │
│            tts/ sentence splitter + speechSynthesis queue       │
│            audio/ mic capture + VAD (Whisper path only)          │
└─────────────────────────────────────────────────────────────────┘
```

Security baseline: `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`, strict CSP, no remote content (fonts are bundled),
IPC payloads validated in main.

### 3.1 Directory layout

```
src/
  shared/        types.ts, ipc.ts (channel names + payload types)
  main/
    index.ts     app lifecycle
    app/         tray.ts, windows.ts, shortcuts.ts, login-item.ts, updater.ts
    claude/      locate.ts, args.ts, stream-parser.ts, runner.ts
    stt/         engine.ts, apple.ts, whisper.ts, model-download.ts, hallucinations.ts
    store/       settings.ts, history.ts, atomic-write.ts
    ipc/         handlers.ts
  preload/       index.ts
  renderer/      assistant/, settings/, tts/, audio/, styles/
native/macos/SpeechHelper/   Swift package → `speech-helper` binary
tests/           unit tests mirroring src/
```

## 4. Components

### 4.1 `claude/`

- `locate.ts`: resolve the CLI path. Settings override first, then `PATH`
  (`claude`, and on Windows `claude.exe` then `claude.cmd`), then known install
  locations (`~/.local/bin/claude`, `%USERPROFILE%\.local\bin\claude.exe`,
  `%APPDATA%\npm\claude.cmd`). `.cmd` files are spawned with `shell: true`;
  everything passed to them is already validated (model regex, UUID).
- `args.ts`: pure function → `['-p', '--output-format', 'stream-json',
'--verbose', '--include-partial-messages', '--tools', '',
'--strict-mcp-config', '--setting-sources', 'project', '--system-prompt', …,
'--model', …, '--session-id' | '--resume', id]`. The question goes over
  **stdin**, never argv.
- `stream-parser.ts`: NDJSON line splitter + mapping from CLI events to
  `{type:'delta'|'done'|'error'}`. Ported from `legacy/web-prototype/server.js`.
- `runner.ts`: spawns the CLI with `cwd = userData/workspace`. Enforces one
  in-flight request per session, a timeout (default 120 s) and `cancel()`.
  Maps "not logged in", ENOENT and timeout to user-facing messages.

System prompts (vi/en) keep the prototype's rules: spoken style, 1–4 sentences,
no markdown. With clipboard context, the clipboard text is appended to the
user message inside a delimited block (max 20 000 chars, truncated with notice).

### 4.2 `stt/`

```ts
interface SttEngine {
  start(opts: { lang: 'vi' | 'en'; silenceMs: number }): void;
  stop(): void; // finish and emit final
  cancel(): void; // discard
  on(event: 'partial' | 'final', cb: (text: string) => void): void;
  on(event: 'level', cb: (rms: number) => void): void;
  on(event: 'error', cb: (err: SttError) => void): void;
}
```

- **AppleSpeechEngine**: spawns `speech-helper --lang vi-VN`. Helper protocol is
  JSON lines on stdout: `{"type":"partial","text"}`, `{"type":"final","text"}`,
  `{"type":"error","code","message"}`. The helper captures audio with
  `AVAudioEngine` itself and ends on silence (no new partials for `silenceMs`).
  Permission states map to `SttError` codes: `mic-denied`,
  `speech-denied`, `unsupported-locale`.
- **WhisperEngine**: renderer captures 16 kHz mono PCM via `getUserMedia` +
  AudioWorklet, runs an energy-based VAD and sends the utterance to main when
  speech is followed by `silenceMs` of silence. Main writes a temp WAV and
  runs `whisper-cli -m <model> -l vi|en -nt -otxt`. No live partials. Only a
  level meter. Hallucination guard: drop utterances under 400 ms of speech or
  below the RMS floor; drop known phantom outputs (e.g. "Hãy subscribe cho
  kênh…", "Thank you for watching").
- Engine choice: macOS → Apple, Windows → Whisper. A hidden setting allows
  Whisper on macOS for testing.
- `model-download.ts`: downloads `whisper-cli` and `ggml-small.bin` on first
  use into `userData/models`, verifies SHA-256, shows progress, resumable.

### 4.3 `store/`

- `settings.json` (versioned schema, defaults merged on read):
  `model`, `lang`, `shortcuts.ask`, `shortcuts.askWithClipboard`,
  `voice.vi`, `voice.en`, `rate`, `autoSpeak`, `silenceMs`, `claudePath`,
  `launchAtLogin`.
- `history/<sessionId>.json`: `{id, title, lang, createdAt, updatedAt,
messages:[{role, text, at}]}`. Title is the first user message (60 chars).
- All writes go through `atomic-write.ts` (write temp → rename).

### 4.4 App shell

- Tray menu: Ask, Ask with clipboard, History, Settings, Launch at login,
  Check for updates, Quit. macOS: `app.dock.hide()`.
- Default shortcuts: macOS `Alt+Space` (⌥Space), `Alt+Shift+Space`.
  Windows `Ctrl+Alt+Space`, `Ctrl+Alt+Shift+Space` (`Alt+Space` is the window
  system menu). If registration fails, show a tray notification and point to
  Settings.
- Assistant window: frameless, always on top, centered on the active display,
  hides on blur/`Esc` when idle. Reuses the prototype's design tokens and
  layout with Be Vietnam Pro bundled locally.

## 5. Data flow (ask)

1. Shortcut → main shows window, creates/continues session, `stt.start()`.
2. `partial` events → renderer shows live text (macOS).
3. `final` → renderer shows user bubble → IPC `claude:ask {sessionId, text,
lang, withClipboard}`.
4. Main streams `delta` events to the renderer and the renderer queues
   complete sentences into `speechSynthesis` as they arrive.
5. `done` → history appended, state returns to idle when speech queue drains.
6. Shortcut or `Esc` during listening/speaking cancels the current step.

## 6. Errors

| Condition                      | User sees                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| CLI not found                  | "Không tìm thấy Claude CLI" + button to pick path in Settings                          |
| CLI not logged in              | "Claude CLI chưa đăng nhập: chạy `claude` rồi `/login`"                                |
| Timeout                        | "Claude phản hồi quá lâu, đã dừng"                                                     |
| Mic / speech permission denied | Explanation + button opening the right OS settings pane                                |
| No voice for language          | Hint to install "Linh" (macOS Spoken Content) / "Microsoft An" (Windows language pack) |
| Model download fails           | Retry button. Assistant still works by typing                                          |
| Shortcut taken                 | Tray notification + Settings                                                           |

## 7. Testing

- **Unit (Vitest):** `args`, `stream-parser`, `locate` (fake fs/PATH),
  `runner` (fake CLI script emitting stream-json), sentence splitter,
  hallucination filter, VAD on synthetic buffers, settings schema/migration,
  history store, atomic write.
- **Swift helper:** `swift build` in CI on macOS. Manual permission checks.
- **Manual smoke (each release):** checklist in `docs/testing.md` covering
  both languages × both OSes.
- **Limit:** development happens on macOS. Windows is covered by CI
  (lint/typecheck/test/build) and a manual pass on a Windows machine.

## 8. Packaging & release

- electron-builder: macOS `.dmg` (arm64 + x64), Windows NSIS `.exe` (x64).
- `Info.plist`: `NSMicrophoneUsageDescription`,
  `NSSpeechRecognitionUsageDescription`, `LSUIElement`.
- GitHub Actions: CI on push/PR (macOS + Windows). Release workflow on `v*`
  tags publishes to GitHub Releases. `electron-updater` reads from there.
- **Code signing:** none in v1. Windows auto-update works unsigned (SmartScreen
  warns on first install). macOS auto-update requires a Developer ID. Until
  then macOS users update manually, and the updater is disabled on macOS
  unsigned builds.

## 9. Migration from the prototype

- Kept: system prompts, stream-json parsing, sentence-streaming TTS, voice
  selection logic, UI tokens/layout, CLI safety flags.
- Removed: Express, EJS, Docker, the HTTP bridge and `BRIDGE_TOKEN`.
- The prototype stays runnable in `legacy/web-prototype/` until v1 ships.
