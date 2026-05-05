# Sprint B — Spaces & Public Request Portal Design Spec

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Sprint B adds two interconnected capabilities to ServIQ-FM:

1. **Spaces within Sites** — each site can have rooms/spaces organised by floor, each with a unique QR code. Scanning a QR code opens a public request form pre-filled with that space's context.
2. **Public Request Portal** — a no-auth form at `/r/[token]` where occupants submit maintenance requests. Admins review requests in a new dashboard, approving (which creates a Work Order) or rejecting. Requesters receive email updates at every stage and can track their request at `/track/[token]`.

---

## Decisions Made

| Question | Decision |
|---|---|
| Email provider | Nodemailer + Hostinger SMTP (`admin@serviqfm.com`) |
| QR URL format | `/r/[qr_token]` (short, smaller QR codes) |
| Requester tracking | Trackable link `/track/[tracking_token]` sent by email on submission |
| Space structure | Floor/level grouping — each space belongs to a named floor |
| Asset commission/decommission | Confirmation dialog before any state change |
| Spaces UI location | Dedicated sub-page per site: `/dashboard/sites/[id]/spaces` (Approach B) |
| Bulk QR export | PDF via `@react-pdf/renderer`, layout selector: 2 / 4 / 6 per A4 page |

---

## Database Schema

### New table: `spaces`

```sql
CREATE TABLE spaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text NOT NULL,
  name_ar         text,
  floor           text NOT NULL,
  description     text,
  qr_token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage spaces"
  ON spaces FOR ALL
  USING (organisation_id = (SELECT organisation_id FROM users WHERE id = auth.uid()));
```

### New table: `requests`

```sql
CREATE TABLE requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id          uuid NOT NULL REFERENCES sites(id),
  space_id         uuid REFERENCES spaces(id),
  requester_name   text NOT NULL,
  requester_email  text NOT NULL,
  requester_phone  text,
  title            text NOT NULL,
  description      text NOT NULL,
  category         text NOT NULL,
  photo_urls       text[] NOT NULL DEFAULT '{}',
  file_urls        text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  work_order_id    uuid REFERENCES work_orders(id),
  rejection_reason text,
  tracking_token   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (submit a request) — no auth required
CREATE POLICY "public can submit requests"
  ON requests FOR INSERT
  WITH CHECK (true);

-- Public can SELECT their own request by tracking_token — for the /track/[token] page
CREATE POLICY "public can track own request"
  ON requests FOR SELECT
  USING (true);  -- token-based access enforced at API/page level, not RLS

-- Org members can fully manage their org's requests
CREATE POLICY "org members can manage requests"
  ON requests FOR ALL
  USING (organisation_id = (SELECT organisation_id FROM users WHERE id = auth.uid()));
```

### Alterations to existing tables

```sql
-- Assets can be assigned to a space
ALTER TABLE assets ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES spaces(id);

-- Work orders can be linked to originating request and space
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES requests(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS space_id   uuid REFERENCES spaces(id);
```

---

## Route Structure

### Dashboard (auth-protected, existing layout + sidebar)

| Route | Purpose |
|---|---|
| `/dashboard/sites/[id]/spaces` | Spaces list for a site, grouped by floor |
| `/dashboard/sites/[id]/spaces/new` | Add a space form |
| `/dashboard/sites/[id]/spaces/[sid]/edit` | Edit a space |
| `/dashboard/requests` | Admin request review list |
| `/dashboard/requests/[id]` | Request detail + approve / reject |

### Public (no auth, minimal layout — ServIQ-FM logo only, no sidebar)

| Route | Purpose |
|---|---|
| `/r/[token]` | QR-linked request form, pre-filled with space context |
| `/track/[token]` | Requester's status tracking page |

### API routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/requests/submit` | None (public) | Create request row, upload attachments, send confirmation email |
| `POST /api/requests/[id]/approve` | Required | Create WO from request, send approval email |
| `POST /api/requests/[id]/reject` | Required | Set status=rejected, send rejection email |
| `POST /api/spaces/export-qr` | Required | Generate QR PDF for selected spaces |

---

## Feature Designs

### 1. Spaces Within Sites

**Sites list** (`/dashboard/sites`): Each site card gets a "Spaces" button alongside Edit/Deactivate/Delete.

**Spaces page** (`/dashboard/sites/[id]/spaces`):
- Header: site name breadcrumb + "Add Space" button + "Export QR Codes" button
- Spaces grouped by floor — collapsible section per floor showing space count
- Each space card: name (EN + AR if set), description, floor label, two action buttons: **Edit** and **QR Code**
- **QR Code modal**: shows QR image, space name, floor, site name — buttons: **Download PNG** and **Print**

**Add/Edit space form**:
- Floor: text input with `<datalist>` of existing floor names for this site (consistency)
- Name EN (required)
- Name AR (optional)
- Description (optional)

**Bulk QR Export modal** (triggered by "Export QR Codes" button):
- Floor filter: All Floors / select specific floor (dropdown populated from this site's floors)
- Layout: **2 per page** / **4 per page** / **6 per page** (3 radio options)
- "Generate PDF" button → calls `/api/spaces/export-qr`

**QR PDF layout**: Each card contains QR code image (generated server-side via `qrcode` package), space name (large), floor name, site name (small). Cards sized to fill the selected grid, cut lines implied by card borders. Generated with `@react-pdf/renderer`.

**QR code generation**: Client-side for modal preview using `qrcode` npm package (`qrcode.toDataURL(url)`). Server-side in the PDF export route for the same reason.

---

### 2. Public Request Portal (`/r/[token]`)

**Layout**: Minimal public layout — ServIQ-FM logo top-left, no sidebar, page background `C.pageBg`.

**If token invalid**: Full-page error — "This QR code is no longer active. Please contact the building management team."

**4-panel form layout** (desktop: 4 columns, tablet: 2×2, mobile: single column):

| Panel 1: Requester Info | Panel 2: Request Details | Panel 3: Attachments | Panel 4: Location |
|---|---|---|---|
| Full Name* | Title* | Photos (up to 3) | Pre-filled, read-only |
| Phone | Description* | File attachment (1) | Site name |
| Email* | Category* (dropdown) | | Space name + floor |

*required

Category options (same as WO categories): HVAC · Electrical · Plumbing · Elevator/Lift · Fire Safety · Furniture · Kitchen Equipment · Pool/Gym · IT Equipment · Signage · Vehicle · Other

Footer note: "All requests are sent directly to the company admin."
Submit button: full-width navy, label "Submit Request".

**On submit**: POST to `/api/requests/submit` → success replaces form with confirmation card:
> "✓ Request Submitted — Thank you, [Name]. We've received your request and sent a confirmation to [email]. You can track your request status using the link in that email."

---

### 3. Request Tracking Page (`/track/[token]`)

**If token invalid**: "This tracking link is no longer valid."

**Content**:
- Header: site name + space name
- Request summary: title, category, description, submitted date
- Status timeline (vertical stepper):
  - ✓ Submitted
  - ✓/⏳ Under Review
  - ✓/⏳ Approved → Work Order Created (shows WO number) OR ✗ Rejected (shows reason)
  - If approved — WO status chain: Assigned → In Progress → On Hold → Completed → Finished
- Current status highlighted; future steps greyed out

---

### 4. Requests Dashboard (`/dashboard/requests`)

**List page**:
- Header: "Requests" + pending count badge
- Filter tabs: All · Pending · Approved · Rejected
- Table: WO # · Requester · Site · Space · Category · Submitted · Status · Actions
- Pending rows sorted to top; within each status, newest first
- Inline actions on pending rows: **Review** / **Approve** / **Reject**

**Sidebar nav**: "Requests" item between Work Orders and Assets, red badge showing pending count.

**Detail page** (`/dashboard/requests/[id]`):
- Left: requester info, location (site + space + floor), title, category, full description
- Right: photo/file attachments, status timeline
- Pending actions:
  - **Approve → Create Work Order**: slides open a pre-filled mini-form (priority, assignee, due date — title/description/category/site/space already set). Confirm → creates WO, links `request_id` + `space_id`, sends approval email
  - **Reject**: modal with optional reason text → sends rejection email
- Approved: linked WO number (clickable → WO detail)
- Rejected: rejection reason shown

---

### 5. Email Notifications

**Infrastructure**: `web/src/lib/email.ts` — Nodemailer transport using Hostinger SMTP.

**Env vars required**:
```
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=admin@serviqfm.com
EMAIL_PASS=<hostinger email password>
EMAIL_FROM=ServIQ-FM <admin@serviqfm.com>
```

**6 email triggers**:

| # | Trigger | To | Subject |
|---|---|---|---|
| 1 | Request submitted | Requester | "Request received — [Site Name]" |
| 2 | Request approved | Requester | "Your request has been approved — WO-[number]" |
| 3 | Request rejected | Requester | "Update on your request — [Site Name]" |
| 4 | WO status → in_progress | Requester | "Work has started on your request" |
| 5 | WO status → completed | Requester | "Your request has been completed" |
| 6 | WO status → finished | Requester | "Request closed — [Site Name]" |

Emails 4–6 only fire when the WO has a linked `request_id`. All emails include the tracking link.

**Email template**: Plain HTML — ServIQ-FM logo text header, clean single-column layout, brand navy/teal colours, tracking link as a prominent button.

---

### 6. Space-aware Work Order Detail

When a WO has a `space_id`, a new **"Space Assets"** tab appears in the WO detail page (alongside Comments / History / Photos / Parts / Activity).

**Tab content**:
- Header: space name + floor (read-only context)
- Table of assets assigned to this space: Name · Category · Status (Online/Offline badge) · Actions
- Per asset: **Commission** button (disabled if already Online) + **Decommission** button (disabled if already Offline)
- Clicking either → confirmation modal: "Mark [Asset Name] as [online/offline]?" → Cancel / Confirm
- On confirm: `UPDATE assets SET status = '...' WHERE id = ...` + append activity log entry on the WO: "Technician [name] commissioned/decommissioned [Asset Name]"

**WO creation from request**: When admin approves a request and creates a WO, `space_id` is automatically copied from the request to the WO.

---

## Package Dependencies

| Package | Purpose | Already installed? |
|---|---|---|
| `qrcode` | Generate QR code data URLs | No — add |
| `nodemailer` | SMTP email sending | No — add |
| `@types/nodemailer` | TypeScript types | No — add |
| `@types/qrcode` | TypeScript types | No — add |
| `@react-pdf/renderer` | QR PDF export | Yes ✓ |

---

## Security Notes

- `/api/requests/submit` is intentionally public (no auth) — rate limiting via Vercel edge config or a simple in-memory throttle per IP should be added post-MVP
- `requests` table RLS: public can INSERT only; SELECT/UPDATE restricted to org members
- `spaces` table: qr_token is a UUID — not guessable; no additional auth needed for the public form
- `tracking_token` on requests: UUID, unguessable — sufficient for read-only status display
- Attachment uploads go to Supabase Storage in a `requests/` bucket with a 10MB per-file limit
