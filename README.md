# 🦘 OzVisa

> SaaS web app helping Working Holiday Visa (WHV 417 & 462) holders in Australia renew their visa easily.

## Overview

Users upload their payslip and/or employer letter → AI (Claude) extracts all relevant information → Step-by-step guide with direct official links and copy-paste ready data to complete the visa application on the Australian government website.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui components |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe (one-time, 29€) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Email | Resend |
| i18n | next-intl (French + English) |
| Deployment | Vercel |

## Payment Flow

1. User uploads documents + enters email
2. Stripe Checkout (hosted page) — 29€ one-time
3. Stripe webhook confirms payment → triggers AI analysis
4. Results displayed at `/results?id=...` + sent by email

## Pages

| Route | Description |
|---|---|
| `/` | Landing page (hero, how-it-works, pricing, FAQ) |
| `/upload` | File upload form + email + visa type selector |
| `/processing` | Payment verification + loading animation |
| `/results?id=` | Full analysis results + guide + PDF download |
| `/admin` | Password-protected admin dashboard |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
# Fill in all values
```

### 3. Supabase database

Run the migration in your Supabase SQL editor:

```
supabase/migrations/001_create_analyses.sql
```

### 4. Stripe webhook (local development)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook secret to `STRIPE_WEBHOOK_SECRET` in `.env.local`.

In production, add in Stripe Dashboard:
- URL: `https://your-domain.vercel.app/api/stripe/webhook`
- Events: `checkout.session.completed`

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy to Vercel

```bash
vercel deploy
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

## Security

- Documents processed in memory only — never stored on disk or DB
- Only extracted JSON stored in Supabase, not original files
- Rate limiting: 5 requests/IP/hour on upload endpoint
- All secrets via environment variables
- Stripe webhook signature verification

## Official References

- [WHV 417](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417)
- [WHV 462](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-and-holiday-462)
- [Specified Work](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work)
- [ImmiAccount](https://online.immi.gov.au/lusc/login)
