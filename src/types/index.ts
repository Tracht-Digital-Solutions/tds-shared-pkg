/**
 * Shared TypeScript types used across the TDS frontends.
 *
 * Backend-side types are duplicated by hand into each PHP service's
 * `src/Domain/` directory; this file is the source of truth for the
 * JS/TS side.
 */

import type { PortalPermission } from "../permissions";

export type Lang = "de" | "en";

export type UserStatus = "active" | "disabled";

/**
 * A login identity (auth-api `app_user`). Spans both panels: `isAdmin` grants
 * admin-panel access; a non-null `customerId` ties the account to a company
 * (tenant) in the customer portal, scoped by `permissions`. Multiple users may
 * share the same `customerId` (several accounts per company).
 */
export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  customerId: number | null;
  permissions: PortalPermission[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The current authenticated principal — returned by auth-api `GET /me` and
 * used by both panels to drive UI gating (the JWT itself lives in an httpOnly
 * cookie and is not readable from JS).
 */
export interface Me {
  userId: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  customerId: number | null;
  permissions: PortalPermission[];
}

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
