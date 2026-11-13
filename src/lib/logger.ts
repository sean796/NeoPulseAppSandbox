/**
 * The one route for runtime diagnostics in the browser.
 *
 * Direct `console.*` calls are banned in app code (Wave 8 sweep); every
 * diagnostic flows through here so it can be silenced or forwarded in
 * exactly one place. `debug` maps to `console.info` because devtools hides
 * `console.debug` unless verbose logging is on.
 *
 * Colored, emoji-tagged helpers so the console reads at a glance:
 *   🚀 start (cyan)      ✅ success (green)     🏁 batch done (green)
 *   🤖 LLM call (purple) 📤 WordPress publish (cyan)
 *   ⚠️ warn (yellow)     ❌ error (red)
 */
type LogFn = (...args: unknown[]) => void;

function styled(write: LogFn, emoji: string, color: string): LogFn {
  return (message: unknown, ...rest: unknown[]) => {
    write(`%c${emoji} ${String(message)}`, `color: ${color}; font-weight: bold;`, ...rest);
  };
}

const infoWrite: LogFn = (...args) => console.info(...args);
const warnWrite: LogFn = (...args) => console.warn(...args);
const errorWrite: LogFn = (...args) => console.error(...args);

export const logger = {
  info: infoWrite,
  debug: infoWrite,
  warn: warnWrite,
  error: errorWrite,
  /** 🚀 A batch, post, or parallel wave is starting. */
  start: styled(infoWrite, "🚀", "#22d3ee"),
  /** ✅ Something finished and landed. */
  success: styled(infoWrite, "✅", "#22c55e"),
  /** 🏁 A whole batch finished. */
  done: styled(infoWrite, "🏁", "#22c55e"),
  /** 🤖 An LLM call is going out (model + prompt size are in the message). */
  llm: styled(infoWrite, "🤖", "#c084fc"),
  /** 🤖✅ An LLM call came back (size, finish reason, and seconds are in the message). */
  llmSuccess: styled(infoWrite, "🤖✅", "#22c55e"),
  /** 🤖❌ An LLM call failed; the caller still throws, this just paints it red. */
  llmFail: styled(warnWrite, "🤖❌", "#ef4444"),
  /** 📤 A WordPress publish is going out or has landed. */
  publish: styled(infoWrite, "📤", "#22d3ee"),
};
