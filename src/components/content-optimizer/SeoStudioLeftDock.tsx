import { useEffect, useState } from "react";
import { FileDown, Search, X } from "lucide-react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { PulseEngineInspectorPanel } from "@/components/pulse-assist/PulseEngineInspectorPanel";
import { useDetailsDock } from "@/components/pulse-assist/details-dock-context";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type SeoStudioTab = "seo" | "details";

const RAIL: Array<{ id: SeoStudioTab; label: string; icon: typeof Search }> = [
  { id: "seo", label: "SEO", icon: Search },
  { id: "details", label: "Details", icon: FileDown },
];

/** Left rail for the Content Optimizer, same pattern as Image Studio. */
export function SeoStudioLeftDock() {
  const [tab, setTab] = useState<SeoStudioTab>("seo");
  const [open, setOpen] = useState(false);
  const dock = useDetailsDock();
  const setStudioOpen = dock?.setStudioOpen;

  useEffect(() => {
    setStudioOpen?.(open && tab === "details");
    return () => setStudioOpen?.(false);
  }, [open, setStudioOpen, tab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openTab = (next: SeoStudioTab) => {
    if (open && tab === next) {
      setOpen(false);
      return;
    }
    setTab(next);
    setOpen(true);
  };

  return (
    <div className="relative flex h-full w-20 shrink-0 select-none text-base">
      <aside
        aria-label="SEO studio"
        className="z-20 flex h-full w-20 flex-col items-center justify-center gap-3 border-r border-white/10 bg-zinc-950"
      >
        {RAIL.map((item) => {
          const selected = open && tab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              aria-label={`Open ${item.label}`}
              aria-expanded={selected}
              onClick={() => openTab(item.id)}
              className={cn(
                "flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-2.5 bg-transparent px-1 py-3 text-base text-zinc-400",
                "hover:bg-white/5 hover:text-primary",
                selected && "bg-white/5 text-primary",
              )}
            >
              <Icon className="h-7 w-7 shrink-0" aria-hidden />
              <span className="whitespace-nowrap leading-none">{item.label}</span>
            </button>
          );
        })}
      </aside>

      <div
        role="dialog"
        aria-modal="false"
        aria-hidden={!open}
        aria-label="SEO studio"
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex w-[30rem] max-w-[88vw] flex-col bg-[hsl(0_0%_6%)] text-foreground shadow-[8px_0_32px_rgba(0,0,0,0.55)] transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto visible translate-x-0 opacity-100"
            : "pointer-events-none invisible -translate-x-full opacity-0",
        )}
      >
        <div role="tablist" aria-label="SEO studio sections" className="flex h-8 shrink-0 items-center gap-1 bg-black px-1">
          {RAIL.map((item) => (
            <WorkspacePill
              key={item.id}
              label={item.label}
              active={tab === item.id}
              square
              className="h-8 w-auto min-w-0 flex-1 px-2"
              onClick={() => setTab(item.id)}
            />
          ))}
          <Button size="icon" icon={X} variant="quiet" onClick={() => setOpen(false)} aria-label="Close sidebar" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "seo" ? (
            <PulseEngineInspectorPanel />
          ) : (
            <div ref={dock?.setTarget} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-black" />
          )}
        </div>
      </div>
    </div>
  );
}
