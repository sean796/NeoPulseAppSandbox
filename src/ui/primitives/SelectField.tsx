import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/vendor/select";
import { UI_SELECT_TRIGGER, UI_SELECT_TRIGGER_DATA } from "@/ui/tokens";

const SELECT_WIDTH = {
  xs: "w-[6.5rem]",
  sm: "w-[9rem]",
  md: "w-[10rem]",
  full: "w-full",
  /** Grow with the selected label; set minWidth via triggerStyle for the widest option. */
  auto: "w-auto",
} as const;

export type SelectFieldOption = { value: string; label: string; disabled?: boolean; icon?: LucideIcon };

export type SelectFieldProps = {
  /** The label. Names the field when nothing is selected. */
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  width?: keyof typeof SELECT_WIDTH;
  disabled?: boolean;
  /** "data" = green on black. */
  tone?: "default" | "data";
  contentClassName?: string;
  /** Applied to the trigger (e.g. minWidth from the widest option). */
  triggerStyle?: CSSProperties;
};

/** Dropdown styled as a flat well. Shows the full selected label. */
export function SelectField({
  placeholder,
  value,
  onValueChange,
  options,
  width = "md",
  disabled,
  tone = "default",
  contentClassName,
  triggerStyle,
}: SelectFieldProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={placeholder}
        style={triggerStyle}
        className={cn(tone === "data" ? UI_SELECT_TRIGGER_DATA : UI_SELECT_TRIGGER, SELECT_WIDTH[width])}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="rounded-none py-1.5 pl-3 pr-3 [&>span:first-child]:hidden data-[highlighted]:bg-primary data-[highlighted]:text-black"
          >
            {option.icon ? <option.icon className="mr-2 inline h-4 w-4 shrink-0" /> : null}{option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
