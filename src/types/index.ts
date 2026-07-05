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
 * One company membership of a login: the company (tenant) the account can access
 * plus the permissions it holds **within that company**. A login can hold
 * several memberships (belong to several companies), each with its own
 * permission set — the portal shows one active company at a time.
 */
export interface PortalMembership {
  customerId: number;
  permissions: PortalPermission[];
}

/**
 * A login identity (auth-api `app_user`). Spans both panels: `isAdmin` grants
 * admin-panel access; `memberships` tie the account to one or more companies
 * (tenants), each scoped by its own permissions. Multiple users may share a
 * company.
 *
 * `customerId` / `permissions` are the **legacy single-company** fields — kept
 * for backward compatibility and populated with the primary (first) membership.
 * New code should read `memberships`.
 */
export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  /**
   * Marks an admin account as a support agent — the subset of admins that
   * tickets can be assigned to (the "Bearbeiter"). Independent of `isAdmin`;
   * only meaningful for admin accounts.
   */
  isSupportAgent: boolean;
  memberships: PortalMembership[];
  /** @deprecated primary membership's company — read `memberships` instead. */
  customerId: number | null;
  /** @deprecated primary membership's permissions — read `memberships`. */
  permissions: PortalPermission[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The current authenticated principal — returned by auth-api `GET /me` and
 * used by both panels to drive UI gating (the JWT itself lives in an httpOnly
 * cookie and is not readable from JS).
 *
 * `companies` lists every company the login can access with its per-company
 * permissions (names are resolved separately via customer-api `/me/companies`,
 * which auth-api doesn't know). `customerId` / `permissions` describe the
 * default/active company and stay for backward compatibility.
 */
export interface Me {
  userId: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isSupportAgent: boolean;
  companies: PortalMembership[];
  /** @deprecated default company id — prefer the active company from `companies`. */
  customerId: number | null;
  /** @deprecated default company's permissions — prefer active-company perms. */
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

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketType = "question" | "bug" | "feature" | "other";

export type TicketAuthor = "customer" | "owner";

/**
 * An admin-configurable ticket status (the `ticket_status` registry in
 * tds-customer-api). `visibleToCustomer` decides whether the customer sees this
 * status' real label or a neutral fallback; `isTerminal` marks a closing status
 * (sets the ticket's `closedAt`). `isDefault` is the status new tickets start in.
 */
export interface TicketStatus {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  visibleToCustomer: boolean;
  isTerminal: boolean;
  isDefault: boolean;
}

export interface Ticket {
  id: number;
  customerId: number;
  projectId: number | null;
  subject: string;
  description: string;
  statusId: number;
  priority: TicketPriority;
  type: TicketType;
  /** auth-api `app_user.id` of the assigned support agent, or null. */
  assigneeUserId: number | null;
  createdByType: TicketAuthor;
  createdByUserId: number | null;
  customerActionRequired: boolean;
  customerActionNote: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  authorType: TicketAuthor;
  authorUserId: number | null;
  body: string;
  /** Admin-only note — never returned to a customer principal. */
  isInternal: boolean;
  createdAt: string;
  editedAt: string | null;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  commentId: number | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByType: TicketAuthor;
  createdAt: string;
}
