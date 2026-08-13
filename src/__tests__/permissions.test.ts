import { describe, expect, it } from "vitest";
import {
  PORTAL_PERMISSIONS,
  PORTAL_PERMISSION_LABELS,
  PORTAL_ROLE_PRESETS,
  hasPermission,
  isPermissionKey,
  isPortalPermission,
} from "../permissions";

describe("PORTAL_PERMISSIONS", () => {
  it("has a label for every permission key", () => {
    for (const key of PORTAL_PERMISSIONS) {
      expect(PORTAL_PERMISSION_LABELS[key]).toBeTruthy();
    }
  });

  it("isPortalPermission recognises catalog keys and rejects others", () => {
    expect(isPortalPermission("invoices:pay")).toBe(true);
    expect(isPortalPermission("invoices:delete")).toBe(false);
    expect(isPortalPermission("")).toBe(false);
  });
});

describe("PORTAL_ROLE_PRESETS", () => {
  it("only references valid permission keys", () => {
    for (const preset of Object.values(PORTAL_ROLE_PRESETS)) {
      for (const key of preset.permissions) {
        expect(isPortalPermission(key)).toBe(true);
      }
    }
  });

  it("full grants every permission", () => {
    expect(PORTAL_ROLE_PRESETS.full.permissions).toHaveLength(
      PORTAL_PERMISSIONS.length,
    );
  });

  it("read_only contains only :read keys", () => {
    expect(
      PORTAL_ROLE_PRESETS.read_only.permissions.every((p) => p.endsWith(":read")),
    ).toBe(true);
  });
});

describe("hasPermission", () => {
  it("returns true only when the permission is held", () => {
    expect(hasPermission(["invoices:read", "invoices:pay"], "invoices:pay")).toBe(
      true,
    );
    expect(hasPermission(["invoices:read"], "invoices:pay")).toBe(false);
    expect(hasPermission([], "projects:read")).toBe(false);
  });
});

describe("permission key shape", () => {
  // The rule that replaced the catalog intersection. Hand-duplicated as
  // `Permissions::KEY_PATTERN` in tds-auth-api — if these drift, a key the
  // panel accepts is dropped by the API, which is the exact silent data loss
  // the change was made to end.
  it("accepts every key the shared seed set defines", () => {
    for (const key of PORTAL_PERMISSIONS) {
      expect(isPermissionKey(key), key).toBe(true);
    }
  });

  it("accepts the composed extensions' keys", () => {
    for (const key of ["companies:read", "time:read", "wiki:write", "live-chat:read"]) {
      expect(isPermissionKey(key), key).toBe(true);
    }
  });

  it("rejects anything that is not resource:action", () => {
    for (const bad of [
      "invoices",
      "invoices:",
      ":read",
      "Invoices:read",
      "invoices:Read",
      "invoices read",
      "invoices:read:write",
      "-lead:read",
      "invoices:-lead",
      "",
      "*",
    ]) {
      expect(isPermissionKey(bad), `"${bad}" should be rejected`).toBe(false);
    }
  });

  it("rejects a wildcard, deliberately", () => {
    // A `*` would silently grant every FUTURE extension's permission — exactly
    // the escalation the per-company ceilings exist to prevent.
    expect(isPermissionKey("*")).toBe(false);
    expect(isPermissionKey("tickets:*")).toBe(false);
  });

  it("keeps the seed presets inside the seed set", () => {
    // The groups migration seeds from these; a key here that no longer exists
    // would create a group granting nothing.
    for (const preset of Object.values(PORTAL_ROLE_PRESETS)) {
      for (const key of preset.permissions) {
        expect(PORTAL_PERMISSIONS).toContain(key);
      }
    }
  });
});
