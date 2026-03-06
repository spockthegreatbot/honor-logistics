# Honor Removals & Logistics — Operations System

Replacing 7 Excel spreadsheets with a modern web application for a printer delivery & logistics company. Manages jobs, inventory, toner tracking, billing, and warehouse operations in one place.

## Tech Stack

- **Next.js 15** — App Router, Server Components, SSR
- **TypeScript** — Strict mode
- **Tailwind CSS** — Utility-first styling
- **Supabase** — PostgreSQL database + Auth (magic link)
- **Vercel** — Hosting & deployment

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/spockthegreatbot/honor-logistics.git
   cd honor-logistics
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in your Supabase project URL and anon key:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Run database migrations**

   Open the Supabase SQL editor for your project and paste the contents of:
   ```
   supabase/migrations/001_initial_schema.sql
   ```

5. **Run seed data**

   In the Supabase SQL editor, paste the contents of:
   ```
   supabase/seed.sql
   ```
   This seeds: EFEX client + 4 sub-clients + FY2025-26 pricing rules.

6. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Navigation

| Section | Description |
|---------|-------------|
| **Dashboard** | Overview stats, recent activity |
| **Jobs** | Job management, scheduling, status tracking |
| **Inventory** | Stock levels, warehouse items |
| **Toner** | Toner cartridge tracking and orders |
| **Billing** | Invoices, pricing rules, client billing |
| **Settings** | System configuration, user management |

## Authentication

Login is via **magic link** (passwordless email). Powered by Supabase Auth. Users receive a sign-in link by email — no password required.

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run type-check # TypeScript type checking
```
