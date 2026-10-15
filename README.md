<p align="center">
  <img src="readme-banner.svg" width="100%" alt="ZEVENRA Fashion Commerce Platform" />
</p>

<p align="center">
  <img src="public/brand/logo.svg" width="150" alt="ZEVENRA" />
</p>

<p align="center"><b>Fashion storefront + checkout + pre-order + admin operations for a real online retail workflow.</b></p>

<p align="center">
  <a href="https://zevenra-website.vercel.app"><img src="https://img.shields.io/badge/LIVE_DEMO-OPEN_SITE-7C3AED?style=for-the-badge&logo=vercel&logoColor=white" alt="Open ZEVENRA live site" /></a>
  <img src="https://img.shields.io/badge/TypeScript-Frontend-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## Project Snapshot

| | |
|---|---|
| **Business problem** | Fashion sales across website, Instagram and WhatsApp need shared stock and a clear order process. |
| **Solution** | A modern storefront with normal orders, pre-orders, payments, admin tools and media handling. |
| **Customer options** | Guest checkout, COD and bank transfer. |
| **Operations** | Stock reservation, order fulfilment, pre-order batches and admin control. |

## Visual Experience

<div align="center">
  <img src="public/brand/hero.jpg" width="78%" alt="ZEVENRA storefront visual" />
</div>

## Key Features

- Product catalogue and responsive shopping experience
- Shared inventory across sales channels
- COD and bank-transfer checkout
- Customer receipt upload for bank payments
- Separate no-payment pre-order flow
- Admin product, stock and order management
- Signed Cloudinary media uploads
- Guest checkout with optional customer accounts

## Commerce Flow

**In-stock order**  
`Browse` → `Add to cart` → `Checkout` → `Reserve stock` → `Order fulfilment`

**Pre-order**  
`Request item` → `Admin confirms` → `Batch ordering` → `Item arrives` → `Convert to normal order`

## What This Project Demonstrates

- Turning a retail process into a complete digital workflow
- Separating normal orders from pre-orders without confusing the customer journey
- Connecting customer-facing UI with admin-side operations
- Handling payment evidence, stock and media safely through server-side services
- Thinking about both business usability and technical delivery

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/Cloudinary-3448C5?style=flat-square&logo=cloudinary&logoColor=white" alt="Cloudinary" />
</p>

- **Frontend:** React + Vite + TypeScript
- **API/Hosting:** Vercel + Vercel Functions
- **Data:** Google Sheets + Apps Script
- **Media:** Cloudinary signed uploads
- **Auth:** signed HttpOnly admin/customer sessions

## Run Locally

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run lint
npm run build
```

> Server secrets and production credentials are kept outside the repository through environment variables.

---

<p align="center"><b>Designed around the complete selling workflow — from discovery to fulfilment.</b></p>
