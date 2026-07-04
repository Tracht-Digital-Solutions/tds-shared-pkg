import { z } from "zod";

import { PORTAL_PERMISSIONS } from "../permissions";

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
 * ships in German. `body` is markdown — kept as a single string field
 * so the admin editor stays simple.
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
  coverHint: z.string().max(400).optional().nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
  draft: z.boolean().default(false),
});

export type BlogPostCreateInput = z.infer<typeof BlogPostCreateSchema>;

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
 * Portal permission key — mirrors `PORTAL_PERMISSIONS` from
 * `@tracht-digital-solutions/tds-shared/permissions`. Used to validate the
 * `permissions` array in the user-management payloads below.
 */
export const PermissionSchema = z.enum(PORTAL_PERMISSIONS);

/**
 * Payload accepted by `POST /admin/users` (tds-auth-api). Creates a unified
 * login. `password` may be omitted — the server then generates a temporary one
 * and returns it once. `customerId` ties the account to a company; multiple
 * accounts may share one company. `permissions` only matter for portal access.
 *
 * The PHP side hand-duplicates this validation — keep them in sync.
 */
export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional().nullable(),
  password: z.string().min(12).optional(),
  isAdmin: z.boolean().default(false),
  isSupportAgent: z.boolean().default(false),
  customerId: z.number().int().positive().optional().nullable(),
  permissions: z.array(PermissionSchema).default([]),
  status: z.enum(["active", "disabled"]).default("active"),
});

export type UserCreateInput = z.infer<typeof UserCreateSchema>;

/**
 * Payload accepted by `PATCH /admin/users/{id}` (tds-auth-api). Every field is
 * optional — only the provided ones are updated.
 */
export const UserUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional().nullable(),
  isAdmin: z.boolean().optional(),
  isSupportAgent: z.boolean().optional(),
  customerId: z.number().int().positive().optional().nullable(),
  permissions: z.array(PermissionSchema).optional(),
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
