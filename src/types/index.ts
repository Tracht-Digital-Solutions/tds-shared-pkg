/**
 * Shared TypeScript types used across the TDS frontends.
 *
 * Backend-side types are duplicated by hand into each PHP service's
 * `src/Domain/` directory; this file is the source of truth for the
 * JS/TS side.
 */

export type Lang = "de" | "en";

export interface BlogPost {
  id: number;
  slug: string;
  lang: Lang;
  category: string;
  title: string;
  excerpt: string;
  body: string;
  coverHint: string | null;
  publishedAt: string | null;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export type ProjectStatus =
  | "discovery"
  | "in_progress"
  | "review"
  | "delivered"
  | "on_hold";

export interface Project {
  id: number;
  customerId: number;
  title: string;
  status: ProjectStatus;
  startDate: string | null;
  targetDate: string | null;
  description: string;
}

export type MilestoneStatus = "pending" | "in_progress" | "completed";

export interface Milestone {
  id: number;
  projectId: number;
  title: string;
  status: MilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
}

export type InvoiceStatus = "open" | "paid" | "void";

export interface Invoice {
  id: number;
  customerId: number;
  projectId: number | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  stripeInvoiceId: string | null;
}

export interface DocumentMeta {
  id: number;
  customerId: number;
  projectId: number | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export type MessageAuthor = "customer" | "owner";

export interface Message {
  id: number;
  customerId: number;
  projectId: number | null;
  authorType: MessageAuthor;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Session {
  jti: string;
  customerId: number | null;
  admin: boolean;
  expiresAt: string;
  revokedAt: string | null;
}
