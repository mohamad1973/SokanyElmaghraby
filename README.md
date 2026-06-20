# SOKANY Egypt Headless Storefront

Next.js storefront for `sokany-eg.com`, using WordPress/WooCommerce as the backend and preparing checkout for Fawry + cash on delivery.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- WooCommerce REST API
- Fawry payment integration placeholder

## Local Setup

Copy the environment example:

```bash
cp .env.example .env.local
```

Add WooCommerce and Fawry credentials:

```bash
WOOCOMMERCE_STORE_URL=https://sokany-eg.com
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...
FAWRY_MERCHANT_CODE=...
FAWRY_SECURITY_KEY=...
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Current MVP Scope

- Arabic RTL storefront.
- Home, shop, product, offers, cart, checkout, warranty, contact, and return policy pages.
- Server-side WooCommerce product/category fetching with fallback demo data.
- Product SEO metadata and JSON-LD schema.
- Fawry callback placeholder at `/api/fawry/callback`.
- Checkout placeholder at `/api/checkout`.

## Deployment Plan

Deploy first to a Vercel subdomain for review. After approval, point `sokany-eg.com` to the Next.js storefront while keeping WordPress administration unchanged.

## Next Implementation Steps

- Connect real WooCommerce API keys in `.env.local`.
- Implement cart state and WooCommerce order creation.
- Implement signed Fawry payment creation and callback verification.
- Add advanced filters, wishlist, comparison, and WhatsApp share.
- Replace placeholder imagery with product images from WooCommerce.

