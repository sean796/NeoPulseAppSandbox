/** Opens Settings → Skills Library from a property Skills heading. */
export const NEO_PULSE_OPEN_SKILLS_LIBRARY_EVENT = "neo-pulse-open-skills-library";

export function openSkillsLibrary(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NEO_PULSE_OPEN_SKILLS_LIBRARY_EVENT));
}
