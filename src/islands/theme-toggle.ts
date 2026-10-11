/**
 * The theme toggle on its own entry (0.55). Astro hydrates an island through
 * its module's whole namespace, so an island imported from `./components`
 * ships every component in the barrel. Import islands from here instead.
 */
export { default as ThemeToggle } from "../components/ThemeToggle";
export type { ThemeToggleProps } from "../components/ThemeToggle";
