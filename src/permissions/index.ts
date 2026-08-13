/**
 * The **portal seed set** — the fine-grained capabilities a portal account
 * could hold before the panel grew composable extensions. Admin access is a
 * separate boolean (`isAdmin` on the user), NOT a permission key.
 *
 * ### This is no longer the definition of a valid permission
 *
 * It used to be: `tds-auth-api`'s `Permissions::sanitize()` INTERSECTED every
 * write (and every read) with this list, so a module permission —
 * `companies:read`, `time:read`, `wiki:write` — was silently dropped on its way
 * into the database. The authoritative catalog is the composed one the
 * enforcing service publishes at `GET /admin/permissions`; auth-api now
 * validates the *shape* of a key ({@link isPermissionKey}) and leaves the
 * meaning to whoever enforces it.
 *
 * What this list is still for: **seeding the four system groups**, and acting
 * as the admin editor's fallback catalog when the composed API is unreachable.
 */
export const PORTAL_PERMISSIONS = [
  "projects:read",
  "invoices:read",
  "invoices:pay",
  "documents:read",
  "documents:write",
  "messages:read",
  "messages:write",
  "tickets:read",
  "tickets:write",
] as const;

export type PortalPermission = (typeof PORTAL_PERMISSIONS)[number];

export function isPortalPermission(value: string): value is PortalPermission {
  return (PORTAL_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * The SHAPE of a permission key: `resource:action`, lowercase, hyphens allowed
 * inside each half, 1–32 characters each.
 *
 * Hand-duplicated as `Permissions::KEY_PATTERN` in tds-auth-api — the same
 * convention as every other Zod ↔ PHP validator pair here. Keep them identical.
 *
 * A format check rather than a catalog check, because the catalog lives in the
 * service that *enforces* it: a key nobody recognises grants nothing anywhere
 * (`UserContext::has()` is an exact string match), so the failure mode is inert
 * data rather than the silent data loss the old intersection produced.
 */
export const PERMISSION_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,31}$/;

/** True when `value` is a syntactically valid permission key. */
export function isPermissionKey(value: string): boolean {
  return PERMISSION_KEY_PATTERN.test(value);
}

/**
 * Upper bound on how many keys one grant may carry.
 *
 * The resolved set rides in the JWT, which rides in a cookie; an unbounded
 * array there is a request-header size limit waiting to be hit in production.
 * Mirrored as `Permissions::MAX_KEYS`.
 */
export const MAX_PERMISSION_KEYS = 128;

/**
 * German labels for each permission, shown in the admin user editor.
 * Editable copy lives here (tds-shared), not inlined in a frontend.
 */
export const PORTAL_PERMISSION_LABELS: Record<PortalPermission, string> = {
  "projects:read": "Projekte ansehen",
  "invoices:read": "Rechnungen ansehen",
  "invoices:pay": "Rechnungen bezahlen",
  "documents:read": "Dokumente ansehen & herunterladen",
  "documents:write": "Dokumente hochladen / umbenennen",
  "messages:read": "Nachrichten ansehen",
  "messages:write": "Nachrichten senden",
  "tickets:read": "Tickets ansehen",
  "tickets:write": "Tickets erstellen & beantworten",
};

export type PortalRolePreset = "full" | "accounting" | "project_team" | "read_only";

/**
 * @deprecated Superseded by real, persisted **groups** in `tds-auth-api`
 * (`auth_group`, seeded from exactly these four with matching slugs).
 *
 * These were never more than UI sugar: the editor expanded one into a flat
 * array on click and nothing recorded which preset had been used, so editing a
 * "role" later changed nothing for anyone already carrying it. Kept exported
 * for semver, and still the source the seeding migration was written from —
 * but the migration hard-codes its own copy, because a migration must never
 * import a moving constant.
 */
export const PORTAL_ROLE_PRESETS: Record<
  PortalRolePreset,
  { label: string; permissions: PortalPermission[] }
> = {
  full: {
    label: "Vollzugriff",
    permissions: [...PORTAL_PERMISSIONS],
  },
  accounting: {
    label: "Buchhaltung",
    permissions: ["invoices:read", "invoices:pay", "documents:read"],
  },
  project_team: {
    label: "Projektteam",
    permissions: [
      "projects:read",
      "documents:read",
      "documents:write",
      "messages:read",
      "messages:write",
      "tickets:read",
      "tickets:write",
    ],
  },
  read_only: {
    label: "Nur Lesen",
    permissions: PORTAL_PERMISSIONS.filter((p) => p.endsWith(":read")),
  },
};

/**
 * True when `held` covers `required`. Admin principals bypass this check
 * entirely (they hold full access) — callers should short-circuit on `isAdmin`
 * before consulting permissions.
 */
export function hasPermission(
  held: readonly PortalPermission[],
  required: PortalPermission,
): boolean {
  return held.includes(required);
}
