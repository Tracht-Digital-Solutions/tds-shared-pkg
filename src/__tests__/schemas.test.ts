import { describe, expect, it } from "vitest";
import {
  BLOG_BLOCKS,
  BlogDocumentSchema,
  BlogPostCreateSchema,
  ContactSchema,
  emptyBlogDocument,
  LoginSchema,
  TicketCommentSchema,
  TicketCreateSchema,
  UserCreateSchema,
  UserUpdateSchema,
} from "../schemas";

describe("ContactSchema", () => {
  const valid = {
    name: "Julian",
    email: "hello@example.de",
    message: "This is at least twenty characters long.",
    consent: true,
  };

  it("accepts a minimal valid payload", () => {
    expect(ContactSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects too-short name", () => {
    const res = ContactSchema.safeParse({ ...valid, name: "J" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("name");
    }
  });

  it("rejects an invalid email", () => {
    const res = ContactSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("email");
    }
  });

  it("rejects too-short message", () => {
    const res = ContactSchema.safeParse({ ...valid, message: "short" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("message");
    }
  });

  it("rejects missing consent", () => {
    const { consent: _drop, ...rest } = valid;
    const res = ContactSchema.safeParse(rest);
    expect(res.success).toBe(false);
  });

  it("rejects consent=false explicitly", () => {
    const res = ContactSchema.safeParse({ ...valid, consent: false });
    expect(res.success).toBe(false);
  });

  it("allows optional company", () => {
    const res = ContactSchema.safeParse({ ...valid, company: "Acme GmbH" });
    expect(res.success).toBe(true);
  });

  it("rejects non-empty honeypot (website)", () => {
    const res = ContactSchema.safeParse({ ...valid, website: "spambot" });
    expect(res.success).toBe(false);
  });

  it("accepts empty honeypot", () => {
    const res = ContactSchema.safeParse({ ...valid, website: "" });
    expect(res.success).toBe(true);
  });
});

describe("BlogPostCreateSchema", () => {
  const valid = {
    slug: "my-first-post",
    lang: "de" as const,
    category: "engineering",
    title: "A first post",
    excerpt: "A teaser that exists.",
    body: "This is the body and is long enough.",
  };

  it("accepts a minimal valid payload and defaults draft=false", () => {
    const res = BlogPostCreateSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.draft).toBe(false);
      expect(res.data.lang).toBe("de");
    }
  });

  it("defaults lang to de when omitted", () => {
    const { lang: _drop, ...rest } = valid;
    const res = BlogPostCreateSchema.safeParse(rest);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.lang).toBe("de");
    }
  });

  it("rejects uppercase slug", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, slug: "My-Post" });
    expect(res.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, slug: "my post" });
    expect(res.success).toBe(false);
  });

  it("accepts hyphenated lowercase slug with digits", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, slug: "post-42-final" });
    expect(res.success).toBe(true);
  });

  it("rejects unsupported lang", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, lang: "fr" });
    expect(res.success).toBe(false);
  });

  it("rejects too-short body", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, body: "too short" });
    expect(res.success).toBe(false);
  });

  it("coerces a publishedAt ISO string to Date", () => {
    const res = BlogPostCreateSchema.safeParse({
      ...valid,
      publishedAt: "2026-05-12T10:00:00Z",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.publishedAt).toBeInstanceOf(Date);
    }
  });

  it("accepts null publishedAt + coverHint", () => {
    const res = BlogPostCreateSchema.safeParse({
      ...valid,
      publishedAt: null,
      coverHint: null,
    });
    expect(res.success).toBe(true);
  });

  it("defaults bodyFormat to markdown", () => {
    const res = BlogPostCreateSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.bodyFormat).toBe("markdown");
    }
  });

  it("accepts bodyFormat=blocks", () => {
    const res = BlogPostCreateSchema.safeParse({ ...valid, bodyFormat: "blocks" });
    expect(res.success).toBe(true);
  });
});

describe("BlogDocumentSchema", () => {
  it("accepts the empty starter document", () => {
    expect(BlogDocumentSchema.safeParse(emptyBlogDocument()).success).toBe(true);
  });

  it("accepts a document with every catalog block", () => {
    const blocks = BLOG_BLOCKS.map((b) => b.block);
    const res = BlogDocumentSchema.safeParse({ version: 1, blocks });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const res = BlogDocumentSchema.safeParse({
      version: 1,
      blocks: [{ type: "table", rows: [] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a heading with an out-of-range level", () => {
    const res = BlogDocumentSchema.safeParse({
      version: 1,
      blocks: [{ type: "heading", level: 4, text: "x" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty blocks array", () => {
    const res = BlogDocumentSchema.safeParse({ version: 1, blocks: [] });
    expect(res.success).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    const res = BlogDocumentSchema.safeParse({
      version: 2,
      blocks: [{ type: "paragraph", text: "hi" }],
    });
    expect(res.success).toBe(false);
  });

  it("accepts a custom-block reference", () => {
    const res = BlogDocumentSchema.safeParse({
      version: 1,
      blocks: [{ type: "custom", snippetId: 3 }],
    });
    expect(res.success).toBe(true);
  });
});

describe("LoginSchema", () => {
  it("accepts the customer payload (email + password)", () => {
    const res = LoginSchema.safeParse({
      email: "customer@example.de",
      password: "hunter22hunter22",
    });
    expect(res.success).toBe(true);
  });

  it("accepts the admin payload (token)", () => {
    const res = LoginSchema.safeParse({ token: "deadbeef" });
    expect(res.success).toBe(true);
  });

  it("rejects an invalid email shape", () => {
    const res = LoginSchema.safeParse({ email: "bad", password: "x" });
    expect(res.success).toBe(false);
  });
});

describe("UserCreateSchema", () => {
  it("accepts a minimal payload and defaults isAdmin/isSupportAgent/permissions/status", () => {
    const res = UserCreateSchema.safeParse({ email: "staff@example.de" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.isAdmin).toBe(false);
      expect(res.data.isSupportAgent).toBe(false);
      expect(res.data.permissions).toEqual([]);
      expect(res.data.status).toBe("active");
    }
  });

  it("accepts a full company account payload", () => {
    const res = UserCreateSchema.safeParse({
      email: "owner@acme.de",
      name: "Acme Owner",
      customerId: 12,
      isAdmin: false,
      permissions: ["invoices:read", "invoices:pay"],
    });
    expect(res.success).toBe(true);
  });

  it("ACCEPTS a well-formed key the shared catalog does not know", () => {
    // Deliberately reversed. The panel composes thirteen extensions, each
    // contributing its own permissions (`companies:read`, `time:read`,
    // `wiki:write`), and an enum here rejected every one of them — which is
    // how legitimate grants were silently dropped on the way into the
    // database for a year. Validation is now the SHAPE; the catalog belongs
    // to the service that enforces it, where an unknown key grants nothing.
    const res = UserCreateSchema.safeParse({
      email: "x@example.de",
      permissions: ["invoices:delete", "companies:read", "wiki:write"],
    });
    expect(res.success).toBe(true);
  });

  it("still rejects a MALFORMED permission key", () => {
    for (const bad of ["invoices", "Invoices:Read", "invoices:", ":read", "a b:c"]) {
      expect(
        UserCreateSchema.safeParse({ email: "x@example.de", permissions: [bad] }).success,
        `"${bad}" should not parse`,
      ).toBe(false);
    }
  });

  it("caps how many keys one grant may carry", () => {
    // The resolved set rides in the JWT, which rides in a cookie.
    const many = Array.from({ length: 200 }, (_, i) => `mod${i}:read`);
    expect(
      UserCreateSchema.safeParse({ email: "x@example.de", permissions: many }).success,
    ).toBe(false);
  });

  it("rejects a too-short password", () => {
    const res = UserCreateSchema.safeParse({
      email: "x@example.de",
      password: "short",
    });
    expect(res.success).toBe(false);
  });

  it("rejects a non-positive customerId", () => {
    const res = UserCreateSchema.safeParse({
      email: "x@example.de",
      customerId: 0,
    });
    expect(res.success).toBe(false);
  });
});

describe("UserUpdateSchema", () => {
  it("accepts an empty patch", () => {
    expect(UserUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts toggling isAdmin alone", () => {
    expect(UserUpdateSchema.safeParse({ isAdmin: true }).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(UserUpdateSchema.safeParse({ status: "banned" }).success).toBe(false);
  });

  it("accepts toggling isSupportAgent alone", () => {
    expect(UserUpdateSchema.safeParse({ isSupportAgent: true }).success).toBe(true);
  });

  it("accepts a memberships array", () => {
    const res = UserUpdateSchema.safeParse({
      memberships: [
        { customerId: 1, permissions: ["tickets:read", "tickets:write"] },
        { customerId: 2, permissions: ["invoices:read"] },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a membership with a non-positive customerId", () => {
    expect(
      UserUpdateSchema.safeParse({ memberships: [{ customerId: 0, permissions: [] }] }).success,
    ).toBe(false);
  });

  it("accepts a membership carrying an extension's permission", () => {
    expect(
      UserUpdateSchema.safeParse({
        memberships: [{ companyId: 1, permissions: ["companies:read"] }],
      }).success,
    ).toBe(true);
  });

  it("rejects a membership with a malformed permission", () => {
    expect(
      UserUpdateSchema.safeParse({ memberships: [{ companyId: 1, permissions: ["nope"] }] })
        .success,
    ).toBe(false);
  });

  it("still accepts the legacy customerId and normalises it to companyId", () => {
    // Dual-accept: an older client keeps working for one release.
    const res = UserUpdateSchema.safeParse({
      memberships: [{ customerId: 7, permissions: [] }],
    });
    expect(res.success).toBe(true);
    expect(res.success && res.data.memberships?.[0]?.companyId).toBe(7);
  });

  it("requires one of companyId / customerId", () => {
    expect(UserUpdateSchema.safeParse({ memberships: [{ permissions: [] }] }).success).toBe(
      false,
    );
  });

  it("carries the group + company-admin fields through", () => {
    const res = UserUpdateSchema.safeParse({
      memberships: [
        { companyId: 3, groupIds: [1, 2], isCompanyAdmin: true, permissionCeiling: ["a:b"] },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.success && res.data.memberships?.[0]).toMatchObject({
      companyId: 3,
      groupIds: [1, 2],
      isCompanyAdmin: true,
      permissionCeiling: ["a:b"],
    });
  });

  it("carries per-person denies through and defaults them to empty", () => {
    // The override that lets one member of a shared group lose one of its
    // rights without the group being cloned for them.
    const withDenies = UserUpdateSchema.safeParse({
      memberships: [{ companyId: 3, permissionDenies: ["invoices:pay"] }],
    });
    expect(withDenies.success && withDenies.data.memberships?.[0]?.permissionDenies).toEqual([
      "invoices:pay",
    ]);

    // Absent means "nothing withheld" — there is no third state here, which is
    // why this defaults to [] while permissionCeiling is nullish.
    const without = UserUpdateSchema.safeParse({ memberships: [{ companyId: 3 }] });
    expect(without.success && without.data.memberships?.[0]?.permissionDenies).toEqual([]);
  });

  it("validates a denied key by the same shape rule as a granted one", () => {
    expect(
      UserUpdateSchema.safeParse({
        memberships: [{ companyId: 3, permissionDenies: ["nope"] }],
      }).success,
    ).toBe(false);
  });
});

describe("TicketCreateSchema", () => {
  const valid = {
    subject: "Login funktioniert nicht",
    description: "Ich kann mich seit heute nicht mehr anmelden.",
  };

  it("accepts a minimal payload and defaults priority/type", () => {
    const res = TicketCreateSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.priority).toBe("normal");
      expect(res.data.type).toBe("question");
    }
  });

  it("rejects a too-short subject", () => {
    expect(TicketCreateSchema.safeParse({ ...valid, subject: "hi" }).success).toBe(
      false,
    );
  });

  it("rejects a too-short description", () => {
    expect(
      TicketCreateSchema.safeParse({ ...valid, description: "kurz" }).success,
    ).toBe(false);
  });

  it("rejects an unknown priority", () => {
    expect(
      TicketCreateSchema.safeParse({ ...valid, priority: "blocker" }).success,
    ).toBe(false);
  });

  it("accepts an optional projectId", () => {
    expect(
      TicketCreateSchema.safeParse({ ...valid, projectId: 7 }).success,
    ).toBe(true);
  });
});

describe("TicketCommentSchema", () => {
  it("accepts a body and defaults isInternal=false", () => {
    const res = TicketCommentSchema.safeParse({ body: "Danke für die Rückmeldung." });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.isInternal).toBe(false);
    }
  });

  it("rejects an empty body", () => {
    expect(TicketCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("accepts isInternal=true", () => {
    expect(
      TicketCommentSchema.safeParse({ body: "Interne Notiz", isInternal: true })
        .success,
    ).toBe(true);
  });
});
