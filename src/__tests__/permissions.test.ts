import { describe, expect, it } from "vitest";
import {
  PORTAL_PERMISSIONS,
  PORTAL_PERMISSION_LABELS,
  PORTAL_ROLE_PRESETS,
  hasPermission,
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
