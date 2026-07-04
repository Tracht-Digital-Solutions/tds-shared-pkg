/**
 * Portal permission catalog — the fine-grained capabilities a customer-portal
 * account can hold *within its company* (tenant). Admin-panel access is a
 * separate boolean (`isAdmin` on the user), NOT a permission key.
 *
 * This file is the single source of truth for the JS/TS side. The PHP services
 * hand-duplicate this key list — `tds-auth-api` bakes them into the JWT
 * `permissions` claim, `tds-customer-api` enforces them per endpoint. Keep the
 * PHP key list in sync when this changes (same convention as the Zod ↔ PHP
 * validator duplication).
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
 * Role presets — UI convenience in the admin user editor. Each expands to a
 * concrete permission set; "Individuell" (custom toggles) is handled in the UI
 * and is not a preset here.
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
