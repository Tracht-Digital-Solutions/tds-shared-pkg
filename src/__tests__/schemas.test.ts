import { describe, expect, it } from "vitest";
import {
  BlogPostCreateSchema,
  ContactSchema,
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

  it("rejects an unknown permission key", () => {
    const res = UserCreateSchema.safeParse({
      email: "x@example.de",
      permissions: ["invoices:delete"],
    });
    expect(res.success).toBe(false);
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
