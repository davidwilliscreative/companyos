# Putting Opsight online

The hosted version runs on **Vercel** (the website), **Supabase** (sign-in and database) and
**GitHub** (the code), the same setup as the personal finance app. It is still the synthetic-data demo
with simulated connectors; hosting it just makes it reachable from any computer, behind sign-in.

Secret values go **only** into the Vercel and Supabase dashboards. Never paste them into chat, email
or this repository.

## What's already done

- Code: `github.com/davidwilliscreative/companyos` (branch `main`).
- Supabase project **CompanyOS** (`cioqobrhlobjbgtyajuf`, Canada), with the tables from
  `supabase/migrations/` and `david@davidwilliscreative.com` added as the first Executive.

## 1. Google sign-in (Supabase)

You can reuse the Google sign-in app you made for the finance app.

1. Supabase → **CompanyOS** project → **Authentication → Sign In / Providers → Google**. Turn it on and
   copy the **Callback URL** it shows (`https://cioqobrhlobjbgtyajuf.supabase.co/auth/v1/callback`).
2. Google Cloud Console → **APIs & Services → Credentials** → open the OAuth client you used for the
   finance app → under **Authorized redirect URIs** click **Add URI**, paste that callback URL, **Save**.
3. Back in Supabase, paste that client's **Client ID** and **Client Secret** into the Google provider
   and **Save**.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://execos.davidwilliscreative.com`
   - **Redirect URLs**: add `https://execos.davidwilliscreative.com/**` and
     `https://*-david-willis-creative.vercel.app/**` (for preview links).

Anyone can complete a Google sign-in, but only emails listed under **Settings → People with access**
get in; everyone else is signed straight back out.

## 2. Vercel

1. vercel.com → **Add New… → Project** → import **davidwilliscreative/companyos**. Leave the build
   settings as detected (Next.js).
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value | Sensitive |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://cioqobrhlobjbgtyajuf.supabase.co` | No |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key (`sb_publishable_…`) | No |
   | `SUPABASE_SECRET_KEY` | Same page → **Secret keys** → create or reveal one (`sb_secret_…`) | **Yes** |

3. Click **Deploy**. When it finishes, open the `….vercel.app` link and sign in with Google to check it.

## 3. Your domain

1. Vercel → the companyos project → **Settings → Domains** → add `execos.davidwilliscreative.com`.
2. Vercel shows one DNS record to add, normally a **CNAME** named `execos` pointing to a
   `vercel-dns` address. Add exactly what it shows at the company that manages
   davidwilliscreative.com's DNS (where you added the record for the finance app).
3. Wait until Vercel shows the domain as **Valid** (minutes, sometimes longer). HTTPS is automatic.

## 4. Give other people access

Sign in, open **Settings & demo → People with access**, and add each person's Google email with a
role. Executives can preview the other roles from the header; everyone else sees only their own role.

## How this is ready for connectors

- **Secrets stay on the server.** Connector credentials will be added as Sensitive Vercel variables or
  encrypted rows readable only by server code, never `NEXT_PUBLIC_`.
- **Database with row-level security.** Connector data will land in normalized Postgres tables in this
  same Supabase project, each with row-level security, replacing the single demo-state row.
- **Scheduled syncs.** Vercel Cron (as in the finance app) will call server routes that run each
  connector's incremental sync. The connector contract is in `src/lib/connectors/types.ts` and the
  design in `docs/connectors.md`.
- **Real identities.** Roles now come from the members table, so connector permissions can be tied to
  real people.

## Limits of the hosted demo

- Edits are shared by everyone with access and stored as one row; **Reset demo data** (executives
  only) clears them for everyone.
- Data is still synthetic and every connector is still simulated. This is a demo, not production.

## Letting people view the demo without signing in

1. In Vercel, open the companyos project → **Settings → Environment Variables**.
2. Add `PUBLIC_DEMO` with the value `true` (Production), and save.
3. Go to **Deployments**, open the menu (⋯) on the latest one, and choose **Redeploy**.

Anyone with the link can now open the app and try it with the synthetic data. Their changes go to a
separate sandbox, so they never touch what signed-in members see, and they can't add or remove
people. To require sign-in again, delete the variable and redeploy. Turn this off before any real
data is connected.
