import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import type { AssistSubmode } from "@/lib/pulse-assist/types";
import { ADMIN_SUBMODE_LABELS } from "@/lib/pulse-assist/types";
import { cycleSubmode } from "@/lib/pulse-assist/storage";
import { NEO_PULSE_ASSIST_LABEL } from "@/components/pulse-assist/PulseAssistBrandTitle";
import { Button, TextareaField } from "@/ui";

type PulseAssistComposerProps = {
  value: string;
  onChange: (value: string) => void;
  submode: AssistSubmode;
  onSubmodeChange: (submode: AssistSubmode) => void;
  onSend: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

export function PulseAssistComposer({
  value,
  onChange,
  submode,
  onSubmodeChange,
  onSend,
  disabled,
  autoFocus,
  placeholder = `Ask ${NEO_PULSE_ASSIST_LABEL}…`,
}: PulseAssistComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus, disabled]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        onSubmodeChange(cycleSubmode(submode));
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim()) onSend();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [submode, onSubmodeChange, onSend, disabled, value]);

  return (
    <div className="fcw-composer">
      <div className="fcw-composer-pills">
        <Button
          variant="quiet"
          onClick={() => onSubmodeChange(cycleSubmode(submode))}
          aria-label={`Submode ${ADMIN_SUBMODE_LABELS[submode]}. Shift+Tab to cycle.`}
        >
          {ADMIN_SUBMODE_LABELS[submode]}
        </Button>
      </div>
      <TextareaField
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
      />
      <Button
        size="icon"
        icon={Send}
        pressed={Boolean(disabled)}
        variant="quiet"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
      />
    </div>
  );
}
