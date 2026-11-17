import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Field,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SelectField,
} from "@/ui";
import { cn } from "@/lib/utils";
import {
  inferServiceCountry,
  isServiceCountry,
  isWorldCountry,
  nextStateForCountry,
  normalizeServiceRegion,
  regionPlaceholder,
  serviceRegionOptions,
  WORLD_COUNTRY_NORTH_AMERICA,
  WORLD_COUNTRY_OPTIONS,
} from "@/lib/keyword-location-utils";
import { TaskFormFlatGrid, TaskFormPlaceholderCell } from "@/components/manager/tasks/TaskFormLayout";
import type { Location, WordPressSite } from "@/components/integrations/types";
import {
  buildSiteAdditionalLocationsPatch,
  readSiteAdditionalLocations,
} from "@/lib/wordpress-api/site-service-area";
import { UI_SELECT_TRIGGER } from "@/ui/tokens";

const UNSET_SELECT_VALUE = "__unset__";
const COUNTRY_PLACEHOLDER = "Country";
const COUNTRY_LIST_MIN_CH = Math.max(
  COUNTRY_PLACEHOLDER.length,
  "North America".length,
  "United States".length,
  ...WORLD_COUNTRY_OPTIONS.map((c) => c.length),
);

/**
 * Idle = alternating black / zinc.
 * cmdk sets data-selected={true|false} on every item — bare data-[selected]: matches BOTH.
 * Green only when data-selected=true (pointer/keyboard hover).
 */
function countryItemClass(stripeIndex: number): string {
  const idle = stripeIndex % 2 === 0 ? "bg-black" : "bg-zinc-900";
  const idleSelectedFalse =
    stripeIndex % 2 === 0 ? "data-[selected=false]:!bg-black" : "data-[selected=false]:!bg-zinc-900";
  return cn(
    "cursor-pointer rounded-none px-2 py-1.5 text-base text-white",
    idle,
    idleSelectedFalse,
    "data-[selected=false]:!text-white data-[selected=false]:[&_svg]:!text-white",
    "data-[selected=true]:!bg-primary data-[selected=true]:!text-black data-[selected=true]:[&_svg]:!text-black",
  );
}

export function ProfileLocationSelect({
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
  width = "full",
  triggerStyle,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  width?: "xs" | "sm" | "md" | "full" | "auto";
  triggerStyle?: CSSProperties;
}): ReactElement {
  const listed = options.includes(value) || !value ? options : [value, ...options];
  return (
    <SelectField
      placeholder={placeholder}
      width={width}
      triggerStyle={{ ...(width === "sm" ? { flexShrink: 0 } : undefined), ...triggerStyle }}
      value={value || UNSET_SELECT_VALUE}
      disabled={disabled}
      options={[{ value: UNSET_SELECT_VALUE, label: placeholder }, ...listed.map((opt) => ({ value: opt, label: opt }))]}
      onValueChange={(next) => onChange(next === UNSET_SELECT_VALUE ? "" : next)}
    />
  );
}

export function ProfileCountrySearchSelect({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value.trim();
  const query = search.trim().toLocaleLowerCase();

  const restOptions = useMemo(
    () => WORLD_COUNTRY_OPTIONS.filter((c) => !WORLD_COUNTRY_NORTH_AMERICA.includes(c)),
    [],
  );

  const filterList = (list: string[]) =>
    query ? list.filter((c) => c.toLocaleLowerCase().includes(query)) : list;

  const northAmerica = filterList([...WORLD_COUNTRY_NORTH_AMERICA]);
  const rest = filterList(restOptions);
  const unknownSelected =
    selected && !isWorldCountry(selected) ? selected : "";
  /** Trigger sizes to the selected label; list panel can be wider. */
  const triggerMinCh = Math.max(COUNTRY_PLACEHOLDER.length, selected.length || 0, "United States".length);
  const panelStyle = { minWidth: `${COUNTRY_LIST_MIN_CH + 4}ch`, width: "max-content" } as const;

  const commit = (next: string) => {
    onChange(next);
    setSearch("");
    setOpen(false);
  };

  /** Keep popover open; commit on click (cmdk onSelect alone is unreliable here). */
  const bindRow = (next: string) => ({
    onMouseDown: (event: ReactMouseEvent) => {
      event.preventDefault();
    },
    onClick: (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      commit(next);
    },
    onSelect: () => commit(next),
  });

  let stripe = 0;
  const nextStripe = () => {
    const i = stripe;
    stripe += 1;
    return i;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={COUNTRY_PLACEHOLDER}
          className={cn(
            UI_SELECT_TRIGGER,
            "flex w-auto shrink-0 items-center justify-between gap-2",
            className,
          )}
          style={{ minWidth: `${triggerMinCh + 3}ch` }}
        >
          <span className={cn("whitespace-nowrap", !selected && "text-muted-foreground")}>
            {selected || COUNTRY_PLACEHOLDER}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="z-[200] w-auto max-w-[min(24rem,calc(100vw-2rem))] rounded-none border-0 bg-black p-1 text-white shadow-lg"
        style={panelStyle}
      >
        <Command shouldFilter={false} className="rounded-none bg-transparent text-white">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={COUNTRY_PLACEHOLDER}
            className="h-9 text-base text-white placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-56 overflow-y-auto overflow-x-hidden">
            {unknownSelected ? (
              <CommandGroup
                heading="Current"
                className="overflow-visible bg-transparent p-0 [&_[cmdk-group-heading]]:bg-black [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-base [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <CommandItem
                  value={unknownSelected}
                  className={countryItemClass(nextStripe())}
                  {...bindRow(unknownSelected)}
                >
                  <span className="whitespace-nowrap">{unknownSelected}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {northAmerica.length > 0 ? (
              <CommandGroup
                heading="North America"
                className="overflow-visible bg-transparent p-0 [&_[cmdk-group-heading]]:bg-black [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-base [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {northAmerica.map((country) => (
                  <CommandItem
                    key={country}
                    value={country}
                    className={countryItemClass(nextStripe())}
                    {...bindRow(country)}
                  >
                    <span className="whitespace-nowrap">{country}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {rest.length > 0 ? (
              <CommandGroup
                heading="World"
                className="overflow-visible bg-transparent p-0 [&_[cmdk-group-heading]]:bg-black [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-base [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {rest.map((country) => (
                  <CommandItem
                    key={country}
                    value={country}
                    className={countryItemClass(nextStripe())}
                    {...bindRow(country)}
                  >
                    <span className="whitespace-nowrap">{country}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {!northAmerica.length && !rest.length && !unknownSelected ? (
              <CommandEmpty className="py-3 text-center text-base text-muted-foreground">
                No country match
              </CommandEmpty>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
type DraftAdditionalLocation = {
  id: string;
  name?: string;
  address?: string;
  city: string;
  state: string;
  country: string;
  zip?: string;
  phone?: string;
  email?: string;
};

function toDraftAdditionalLocations(
  site?: WordPressSite | null,
  defaultCountry: string = "",
): DraftAdditionalLocation[] {
  return readSiteAdditionalLocations(site).map((loc: Location, idx: number) => {
    const stored = loc.country?.trim() ?? "";
    const country =
      stored ||
      inferServiceCountry(loc.state, defaultCountry) ||
      (isWorldCountry(defaultCountry) ? defaultCountry : "");
    const state = normalizeServiceRegion(loc.state, country);
    return {
      id: loc.id || `loc-${site?.id ?? "site"}-extra-${idx + 1}`,
      name: loc.name,
      address: loc.address,
      city: loc.city ?? "",
      state,
      country,
      zip: loc.zip,
      phone: loc.phone,
      email: loc.email,
    };
  });
}

export function ProfileAdditionalLocationsEditor({
  site,
  defaultCountry,
  defaultState,
  onPatchSite,
  patchSiteId,
}: {
  site?: WordPressSite | null;
  defaultCountry: string;
  defaultState: string;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  patchSiteId?: string | null;
}): ReactElement | null {
  const [rows, setRows] = useState<DraftAdditionalLocation[]>(() =>
    toDraftAdditionalLocations(site, defaultCountry),
  );

  const siteLocationsKey = JSON.stringify(
    readSiteAdditionalLocations(site).map((l) => [l.id, l.city, l.state, l.country]),
  );

  useEffect(() => {
    setRows(toDraftAdditionalLocations(site, defaultCountry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, siteLocationsKey]);

  const commitRows = (nextRows: DraftAdditionalLocation[]) => {
    if (!onPatchSite || !patchSiteId || !site) return;
    onPatchSite(patchSiteId, buildSiteAdditionalLocationsPatch(site, nextRows));
  };

  const handleAddLocation = () => {
    const country = defaultCountry.trim();
    const state = isServiceCountry(country) ? nextStateForCountry(defaultState, country) : "";
    const next: DraftAdditionalLocation[] = [
      ...rows,
      {
        id: `loc-${site?.id ?? "site"}-extra-${Date.now()}-${rows.length + 1}`,
        city: "",
        state,
        country,
      },
    ];
    setRows(next);
    commitRows(next);
  };

  const handleRemoveLocation = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    commitRows(next);
  };

  const handleCityChange = (index: number, city: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, city } : r)));
  };

  const handleCityBlur = () => {
    commitRows(rows);
  };

  const handleCountryChange = (index: number, country: string) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      const nextState = nextStateForCountry(r.state, country);
      return { ...r, country, state: nextState };
    });
    setRows(next);
    commitRows(next);
  };

  const handleStateChange = (index: number, state: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, state } : r));
    setRows(next);
    commitRows(next);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {rows.map((row, idx) => (
        <TaskFormFlatGrid key={row.id} className="grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <TaskFormPlaceholderCell>
            <Field
              value={row.city}
              onChange={(e) => handleCityChange(idx, e.target.value)}
              onBlur={handleCityBlur}
              placeholder={`Additional city ${idx + 1}`}
              aria-label={`Additional city ${idx + 1}`}
              autoComplete="off"
            />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <ProfileCountrySearchSelect
              value={row.country}
              onChange={(val) => handleCountryChange(idx, val)}
            />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <ProfileLocationSelect
              placeholder={regionPlaceholder(row.country)}
              value={row.state}
              options={serviceRegionOptions(row.country)}
              onChange={(val) => handleStateChange(idx, val)}
              disabled={!isServiceCountry(row.country)}
            />
          </TaskFormPlaceholderCell>
          <Button icon={Trash2} onClick={() => handleRemoveLocation(idx)}>
            Remove
          </Button>        </TaskFormFlatGrid>
      ))}
      <div className="flex items-center">
        <Button icon={Plus} onClick={handleAddLocation} disabled={!site || !patchSiteId}>
          Add location
        </Button>
      </div>
    </div>
  );
}