import type { ReactNode } from "react";
import type { WordPressSiteAdminSectionId } from "./WordPressSiteAdminLayout";
import {
  PROPERTIES_SECTION_NAV_BTN_CLASS,
  PROPERTIES_SECTION_NAV_CLASS,
} from "./wordpress-properties-surfaces";

export type PropertyProfileNavProps = {
  sections: { id: WordPressSiteAdminSectionId; label: string }[];
  activeSectionId: WordPressSiteAdminSectionId;
  onSectionChange: (id: WordPressSiteAdminSectionId) => void;
  /** Optional trailing slot (e.g. Save) — same h-11 row as the Properties dropdown. */
  endSlot?: ReactNode;
};

/** Horizontal property section links for the Studio header (inline with Properties dropdown). */
export function PropertyProfileNav({
  sections,
  activeSectionId,
  onSectionChange,
  endSlot,
}: PropertyProfileNavProps) {
  return (
    <nav className={PROPERTIES_SECTION_NAV_CLASS} aria-label="Property sections">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {sections.map((section) => (
          <button
            type="button"
            key={section.id}
            className={PROPERTIES_SECTION_NAV_BTN_CLASS}
            style={{ color: "#ffffff" }}
            data-active={section.id === activeSectionId}
            onClick={() => onSectionChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      {endSlot ? <div className="ml-auto flex shrink-0 items-center pl-2">{endSlot}</div> : null}
    </nav>
  );
}
