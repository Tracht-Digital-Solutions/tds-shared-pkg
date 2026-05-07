import { z } from "zod";

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
