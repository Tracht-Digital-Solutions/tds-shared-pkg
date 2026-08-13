import { z } from "zod";

import {
  MAX_PERMISSION_KEYS,
  PERMISSION_KEY_PATTERN,
  PORTAL_PERMISSIONS,
} from "../permissions";

export * from "./blogBlocks";

/**
 * Contact form payload — used by the landing page contact section
 * and validated server-side by `tds-contact-api`.
 *
 * `website` is the honeypot field: any non-empty value indicates a bot
 * and should be silently rejected by the server.
 */
export const ContactSchema = z.object({
  name: z.string().min(2, "name"),
  email: z.string().email("email"),
  company: z.string().optional(),
  message: z.string().min(20, "message"),
  consent: z.literal(true, { error: () => ({ message: "consent" }) }),
  website: z.string().max(0).optional(),
});

export type ContactFormData = z.infer<typeof ContactSchema>;

/**
 * Payload accepted by `POST /content/blog` (tds-content-api).
 *
 * `slug` is lowercased and validated to match `[a-z0-9-]+` so it lands
 * cleanly in the URL. `lang` defaults to `de` since the site primarily
 * ships in German. `body` is EITHER a markdown string (`bodyFormat="markdown"`,
 * legacy default) OR a JSON `BlogDocument` string (`bodyFormat="blocks"`). The
 * 20-char floor is a cheap non-empty guard; the block variant is validated
 * structurally server-side (and by the editor via `BlogDocumentSchema`).
 */
export const BlogPostCreateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  lang: z.enum(["de", "en"]).default("de"),
  category: z.string().min(2).max(40),
  title: z.string().min(4).max(200),
  excerpt: z.string().min(10).max(400),
  body: z.string().min(20),
  /** Storage format of `body`. `markdown` keeps the legacy single-string path. */
  bodyFormat: z.enum(["markdown", "blocks"]).default("markdown"),
  coverHint: z.string().max(400).optional().nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
  draft: z.boolean().default(false),
  /** Per-post ad rendering mode (blog only). Mirrors the PHP validator. */
  adsMode: z.enum(["default", "off", "auto", "manual"]).default("default"),
  /**
   * auth-api `app_user.id` of the author. Admins may set any eligible author;
   * for a non-admin blog author the server forces it to themselves. Null /
   * omitted leaves the post unassigned. The PHP validator mirrors this.
   */
  authorId: z.number().int().positive().optional().nullable(),
});

export type BlogPostCreateInput = z.infer<typeof BlogPostCreateSchema>;

/**
 * Payload accepted by `PUT /content/authors/{uid}` (tds-content-api) — tds-admin
 * pushes a blog author's display snapshot (from an auth-api `app_user`) so the
 * static blog can render it and it survives the user being deleted. The PHP
 * side hand-duplicates this validation.
 */
export const BlogAuthorSyncSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  avatarUrl: z.string().max(500).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

export type BlogAuthorSyncInput = z.infer<typeof BlogAuthorSyncSchema>;

/**
 * Payload accepted by `POST /auth/admin/login` and
 * `POST /auth/customer/login` (tds-auth-api).
 */
export const LoginSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * One of the nine ORIGINAL portal keys.
 *
 * Kept for code that genuinely means that set — the seed groups, the editor's
 * offline fallback. It is **not** what validates a grant any more: the panel
 * composes thirteen extensions, each contributing its own permissions, and an
 * enum here would reject every one of them.
 */
export const PortalPermissionSchema = z.enum(PORTAL_PERMISSIONS);

/**
 * @deprecated Renamed to {@link PortalPermissionSchema}; use
 * {@link PermissionKeySchema} to validate a grant.
 */
export const PermissionSchema = PortalPermissionSchema;

/**
 * Any syntactically valid permission key, `resource:action`.
 *
 * Validates the SHAPE, not membership of a catalog — the catalog belongs to the
 * service that enforces it (`GET /admin/permissions` on the composed API). An
 * unrecognised key grants nothing anywhere, so accepting it stores inert data;
 * rejecting it silently dropped legitimate grants, which is what actually
 * happened for a year. Mirrors `Permissions::KEY_PATTERN` in tds-auth-api.
 */
export const PermissionKeySchema = z
  .string()
  .regex(PERMISSION_KEY_PATTERN, "expected <resource>:<action>");

/**
 * One company membership: the company id, the permissions held within it, the
 * groups assigned there, and whether this membership administers the company.
 *
 * `companyId` is the field name; `customerId` is accepted as a deprecated alias
 * for one release so an older client keeps working (see the dual-accept note in
 * tds-auth-api's AGENTS.md). Exactly one of the two must be present.
 */
export const MembershipSchema = z
  .object({
    companyId: z.number().int().positive().optional(),
    /** @deprecated legacy name for `companyId`; removed in the follow-up release. */
    customerId: z.number().int().positive().optional(),
    permissions: z.array(PermissionKeySchema).max(MAX_PERMISSION_KEYS).default([]),
    /** Ids of the groups assigned to this user IN this company. */
    groupIds: z.array(z.number().int().positive()).default([]),
    /** Whether this membership may manage the company's own users. */
    isCompanyAdmin: z.boolean().default(false),
    /**
     * The most this membership may ever be granted, `null` = inherit the
     * company policy. Platform-admin only — a company admin cannot raise it.
     */
    permissionCeiling: z.array(PermissionKeySchema).nullish(),
  })
  .refine((m) => m.companyId !== undefined || m.customerId !== undefined, {
    message: "companyId is required",
  })
  .transform((m) => ({ ...m, companyId: m.companyId ?? m.customerId! }));

export type MembershipInput = z.infer<typeof MembershipSchema>;

/**
 * Payload accepted by `POST /admin/users` (tds-auth-api). Creates a unified
 * login. `password` may be omitted — the server then generates a temporary one
 * and returns it once. `memberships` tie the account to one or more companies,
 * each with its own permissions.
 *
 * The legacy `customerId` + `permissions` pair is still accepted (a single
 * membership) for backward compatibility; `memberships` wins when both appear.
 *
 * The PHP side hand-duplicates this validation — keep them in sync.
 */
export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional().nullable(),
  password: z.string().min(12).optional(),
  isAdmin: z.boolean().default(false),
  isSupportAgent: z.boolean().default(false),
  /** Grants blog-authoring access (see `AppUser.isBlogAuthor`). */
  isBlogAuthor: z.boolean().default(false),
  /** Author bio shown on the public blog author page. */
  bio: z.string().max(500).optional().nullable(),
  memberships: z.array(MembershipSchema).optional(),
  /** @deprecated use `memberships` — kept as a single-company fallback. */
  customerId: z.number().int().positive().optional().nullable(),
  /** @deprecated use `memberships`. */
  permissions: z.array(PermissionKeySchema).max(MAX_PERMISSION_KEYS).default([]),
  status: z.enum(["active", "disabled"]).default("active"),
});

export type UserCreateInput = z.infer<typeof UserCreateSchema>;

/**
 * Payload accepted by `PATCH /admin/users/{id}` (tds-auth-api). Every field is
 * optional — only the provided ones are updated. Passing `memberships` replaces
 * the account's full membership set.
 */
export const UserUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional().nullable(),
  isAdmin: z.boolean().optional(),
  isSupportAgent: z.boolean().optional(),
  /** Grants blog-authoring access (see `AppUser.isBlogAuthor`). */
  isBlogAuthor: z.boolean().optional(),
  /** Author bio shown on the public blog author page. */
  bio: z.string().max(500).optional().nullable(),
  memberships: z.array(MembershipSchema).optional(),
  /** @deprecated use `memberships`. */
  customerId: z.number().int().positive().optional().nullable(),
  /** @deprecated use `memberships`. */
  permissions: z.array(PermissionKeySchema).max(MAX_PERMISSION_KEYS).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

/**
 * Ticket priority + type enums — mirror the ENUM columns on the `ticket` table
 * in tds-customer-api. The PHP side hand-duplicates these value lists; keep them
 * in sync. Status is intentionally NOT an enum here — it is admin-configurable
 * at runtime via the `ticket_status` registry, so it travels as a numeric id.
 */
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_TYPES = ["question", "bug", "feature", "other"] as const;

export const TicketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const TicketTypeSchema = z.enum(TICKET_TYPES);

/**
 * Payload accepted by `POST /tickets` (tds-customer-api) — a customer opening a
 * support request. `projectId` optionally links the ticket to one of the
 * customer's projects. The PHP side hand-duplicates this validation.
 */
export const TicketCreateSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  priority: TicketPrioritySchema.default("normal"),
  type: TicketTypeSchema.default("question"),
  projectId: z.number().int().positive().optional().nullable(),
});

export type TicketCreateInput = z.infer<typeof TicketCreateSchema>;

/**
 * Payload accepted by `POST /tickets/{id}/comments` and
 * `POST /admin/tickets/{id}/comments`. `isInternal` is honoured only for admin
 * authors — an internal note is never shown to the customer.
 */
export const TicketCommentSchema = z.object({
  body: z.string().min(1).max(10000),
  isInternal: z.boolean().default(false),
});

export type TicketCommentInput = z.infer<typeof TicketCommentSchema>;
