/** Types shared by the main process, preload script and renderer. */

export type Lang = 'vi' | 'en';

export interface Shortcuts {
  /** Accelerator that opens the window and starts listening. */
  ask: string;
  /** Same as `ask`, but attaches the clipboard text as context. */
  askWithClipboard: string;
}

export interface Settings {
  schemaVersion: 1;
  /** Claude model alias or id passed to `--model`; empty string = CLI default. */
  model: string;
  lang: Lang;
  shortcuts: Shortcuts;
  /** Preferred system voice name per language; empty string = auto-pick. */
  voice: Record<Lang, string>;
  /** speechSynthesis rate, 0.6–1.6. */
  rate: number;
  autoSpeak: boolean;
  /** Silence after speech that ends listening and sends the question. */
  silenceMs: number;
  /** Explicit path to the Claude CLI; empty string = auto-detect. */
  claudePath: string;
  launchAtLogin: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export interface Conversation {
  /** UUID, also used as the Claude CLI session id. */
  id: string;
  title: string;
  lang: Lang;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** Events streamed from the Claude runner to the renderer. */
export type ClaudeEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; code: ClaudeErrorCode; message: string };

export type ClaudeErrorCode =
  'cli-not-found' | 'not-logged-in' | 'timeout' | 'busy' | 'cancelled' | 'cli-failed';

export type SttErrorCode =
  'mic-denied' | 'speech-denied' | 'unsupported-locale' | 'model-missing' | 'engine-failed';

export interface SttError {
  code: SttErrorCode;
  message: string;
}
