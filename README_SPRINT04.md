# Sprint 04 — TripJack Hotel Integration v3.0
## UI Developer Guide + Next.js Examples

> **Target audience:** Frontend / UI developers integrating the hotel booking flow.
> **BFF base URL:** `http://localhost:3001` (dev) — replace with production host.
> **All endpoints require:** a valid JWT `Authorization` header + `X-Tenant-Slug` header.

---

## Table of Contents

1. [Auth Prerequisites](#1-auth-prerequisites)
2. [Booking Flow Overview](#2-booking-flow-overview)
3. [TypeScript Types (copy-paste)](#3-typescript-types-copy-paste)
4. [API Client Helper](#4-api-client-helper)
5. [Endpoint Reference](#5-endpoint-reference)
   - [POST /search](#51-post-search)
   - [POST /pricing](#52-post-pricing)
   - [POST /review](#53-post-review)
   - [POST /book](#54-post-book)
   - [POST /booking-detail](#55-post-booking-detail)
   - [POST /cancel](#56-post-cancel)
   - [GET /static-detail/:hid](#57-get-static-detailhid)
   - [POST /cities](#58-post-cities)
   - [GET /nationalities](#59-get-nationalities)
   - [GET /account/balance](#510-get-accountbalance)
6. [Complete Booking Flow — End-to-End Example](#6-complete-booking-flow--end-to-end-example)
7. [Error Handling Patterns](#7-error-handling-patterns)
8. [Environment Setup (Next.js)](#8-environment-setup-nextjs)

---

## 1. Auth Prerequisites

Every TripJack route requires two headers:

```
Authorization: Bearer <access_token>
X-Tenant-Slug:  acme-corp          ← your tenant's slug
Content-Type:   application/json
```

Obtain the token by calling the login endpoint:

```typescript
// app/lib/auth.ts
export async function login(email: string, password: string, tenantSlug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  return data.access_token as string;  // store in cookie / zustand / context
}
```

> **Stub mode note:** The BFF is currently running in `TRIPJACK_MODE=stub`.
> All hotel data is AI-generated via Gemini Flash. Real TripJack credentials are not yet wired.
> The booking flow is fully functional for UI development and testing.

---

## 2. Booking Flow Overview

The mandatory sequence for a hotel booking is:

```
1. POST /search      → get searchId + list of hotels
2. POST /pricing     → get room/rate options (optionId) for a chosen hotel
3. POST /review      → lock in an option and get reviewId
4. POST /book        → confirm booking with traveller details → get bookingId + PNR
5. POST /booking-detail → show booking confirmation to user
6. POST /cancel      → (optional) cancel the booking
```

> Each step depends on IDs from the previous step.
> `searchId`, `tjHotelId`, `optionId`, and `reviewId` must all be preserved in state
> and threaded through to the next call.

---

## 3. TypeScript Types (copy-paste)

```typescript
// lib/tripjack/types.ts

export interface Room {
  adults: number;
  children?: number;
  childAge?: number[];
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface SearchPayload {
  checkIn: string;       // "YYYY-MM-DD"
  checkOut: string;      // "YYYY-MM-DD"
  hids: string[];        // TripJack hotel IDs e.g. ["100000000001"]
  rooms: Room[];
  currency: string;      // "INR"
  nationality?: string;  // "106" for Indian
}

export interface HotelOption {
  tjHotelId: string;
  name: string;
  img: string;
  rt: number;            // star rating
  option: {
    optionId: string;
    price: { totalPrice: number; currency: string };
  };
}

export interface SearchResult {
  searchId: string;
  hotels: HotelOption[];
}

// ── Pricing ─────────────────────────────────────────────────────────────────

export interface PricingPayload {
  searchId: string;
  tjHotelId: string;
  checkIn: string;
  checkOut: string;
  rooms: Room[];
  currency: string;
}

export interface PricingOption {
  optionId: string;
  rooms: Array<{ name: string; count: number }>;
  mealPlan: string;
  pricing: { totalPrice: number; taxes?: number };
  cancellation: {
    isRefundable: boolean;
    penalties: Array<{ from: string; amount: number }>;
  };
}

// ── Review ──────────────────────────────────────────────────────────────────

export interface ReviewPayload {
  searchId: string;
  optionId: string;
}

export interface ReviewResult {
  reviewId: string;
  priceChanged: boolean;
}

// ── Book ────────────────────────────────────────────────────────────────────

export interface Traveller {
  title: 'MR' | 'MRS' | 'MS' | 'DR';
  fName: string;
  lName: string;
  type: 'ADULT' | 'CHILD';
}

export interface ContactInfo {
  email: string;
  phone: string;   // min 10 digits, no country code prefix
  code?: string;   // e.g. "91"
}

export interface BookPayload {
  reviewId: string;
  travellerInfo: Traveller[];
  contactInfo: ContactInfo;
  paymentInfo: { method: 'WALLET' | 'CREDIT_CARD' | 'NET_BANKING' };
}

export interface BookResult {
  bookingId: string;   // format: TJS + 12 digits
  pnr: string;
  bookingRef: string;
  status: 'CONFIRMED' | 'FAILED' | 'PENDING';
}

// ── Booking Detail ───────────────────────────────────────────────────────────

export interface BookingDetail {
  status: string;
  voucherUrl?: string;
  travellers: Traveller[];
  itinerary: {
    hotelName: string;
    checkInDate?: string;
    checkOutDate?: string;
  };
}

// ── Cancel ───────────────────────────────────────────────────────────────────

export interface CancelResult {
  cancellationId: string;
  refundAmount: number;
  status: 'CANCELLED' | 'FAILED';
}

// ── Static / Utility ────────────────────────────────────────────────────────

export interface HotelStaticDetail {
  name: string;
  address: string;
  amenities: string[];
  images: string[];
}

export interface City {
  cityCode: string;
  cityName: string;
  country: string;
}

export interface Nationality {
  countryId: string;
  name: string;
}

export interface AccountBalance {
  balance: number;
  creditLimit: number;
  currency: string;
}
```

---

## 4. API Client Helper

Create a thin wrapper that injects the auth token and tenant slug automatically.

```typescript
// lib/tripjack/client.ts

const BFF = process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:3001';
const BASE = `${BFF}/api/v1/tripjack/hotels`;

interface ApiOptions {
  token: string;
  tenantSlug: string;
}

async function tjPost<T>(path: string, body: unknown, opts: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
      'X-Tenant-Slug': opts.tenantSlug,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new TripJackError(res.status, json.message ?? 'Request failed', json);
  }

  return json.data as T;
}

async function tjGet<T>(path: string, opts: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'X-Tenant-Slug': opts.tenantSlug,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new TripJackError(res.status, json.message ?? 'Request failed', json);
  }

  return json.data as T;
}

export class TripJackError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public raw: unknown,
  ) {
    super(message);
    this.name = 'TripJackError';
  }
}

export { tjPost, tjGet };
```

---

## 5. Endpoint Reference

### 5.1 POST /search

Search for available hotels by date range and hotel IDs.

**URL:** `POST /api/v1/tripjack/hotels/search`

**Request body:**

```json
{
  "checkIn":     "2025-01-15",
  "checkOut":    "2025-01-17",
  "hids":        ["100000000001", "100000000002"],
  "rooms":       [{ "adults": 2, "children": 1, "childAge": [5] }],
  "currency":    "INR",
  "nationality": "106"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `checkIn` | `string` | ✅ | YYYY-MM-DD |
| `checkOut` | `string` | ✅ | YYYY-MM-DD |
| `hids` | `string[]` | ✅ | One or more TripJack hotel IDs |
| `rooms` | `Room[]` | ✅ | At least one room with ≥1 adult |
| `currency` | `string` | ✅ | 3-letter code e.g. `INR` |
| `nationality` | `string` | — | Country ID e.g. `"106"` (Indian) |

**Response `data`:**

```json
{
  "searchId": "SID-1776677341640-jtb6iy",
  "hotels": [
    {
      "tjHotelId": "100000000001",
      "name": "The Grand Mumbai",
      "img": "https://cdn.tripjack.com/hotel-1.jpg",
      "rt": 4,
      "option": {
        "optionId": "OPT-100000000001-01",
        "price": { "totalPrice": 8500, "currency": "INR" }
      }
    }
  ]
}
```

> Save both `searchId` and `tjHotelId` from the chosen hotel — needed for the next step.

**Next.js example:**

```typescript
// lib/tripjack/api.ts
import { tjPost, type ApiOptions } from './client';
import type { SearchPayload, SearchResult } from './types';

export async function searchHotels(
  payload: SearchPayload,
  opts: ApiOptions,
): Promise<SearchResult> {
  return tjPost<SearchResult>('/search', payload, opts);
}
```

```tsx
// app/hotels/search/page.tsx  (Server Component with form action)
'use server';

import { searchHotels } from '@/lib/tripjack/api';
import { cookies } from 'next/headers';

export async function searchAction(formData: FormData) {
  const token = cookies().get('access_token')?.value ?? '';
  const tenantSlug = cookies().get('tenant_slug')?.value ?? '';

  const result = await searchHotels(
    {
      checkIn:  formData.get('checkIn') as string,
      checkOut: formData.get('checkOut') as string,
      hids:     ['100000000001', '100000000002'],
      rooms:    [{ adults: Number(formData.get('adults')) }],
      currency: 'INR',
      nationality: '106',
    },
    { token, tenantSlug },
  );

  return result;   // { searchId, hotels }
}
```

```tsx
// app/hotels/search/SearchForm.tsx  (Client Component)
'use client';

import { useState } from 'react';
import { searchAction } from './page';
import type { SearchResult } from '@/lib/tripjack/types';

export default function SearchForm() {
  const [result, setResult] = useState<SearchResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = await searchAction(new FormData(e.currentTarget));
    setResult(data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="checkIn"  type="date" required />
      <input name="checkOut" type="date" required />
      <input name="adults"   type="number" defaultValue={2} min={1} />
      <button type="submit">Search Hotels</button>

      {result && (
        <ul>
          {result.hotels.map((h) => (
            <li key={h.tjHotelId}>
              {h.name} — ₹{h.option.price.totalPrice}
              <span> ⭐ {h.rt}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
```

---

### 5.2 POST /pricing

Get room-type and rate options for a specific hotel from a search result.

**URL:** `POST /api/v1/tripjack/hotels/pricing`

**Request body:**

```json
{
  "searchId":  "SID-1776677341640-jtb6iy",
  "tjHotelId": "100000000001",
  "checkIn":   "2025-01-15",
  "checkOut":  "2025-01-17",
  "rooms":     [{ "adults": 2 }],
  "currency":  "INR"
}
```

**Response `data`:**

```json
{
  "options": [
    {
      "optionId": "OPT-100000000001-01",
      "rooms": [{ "name": "Deluxe Room", "count": 1 }],
      "mealPlan": "Room Only",
      "pricing": { "totalPrice": 8500, "taxes": 1020 },
      "cancellation": {
        "isRefundable": true,
        "penalties": [{ "from": "2025-01-10T00:00:00Z", "amount": 0 }]
      }
    }
  ]
}
```

> Save the `optionId` the user selects for the `/review` call.

**Next.js example:**

```typescript
// lib/tripjack/api.ts (add to existing file)
import type { PricingPayload, PricingOption } from './types';

export async function getPricing(
  payload: PricingPayload,
  opts: ApiOptions,
): Promise<{ options: PricingOption[] }> {
  return tjPost('/pricing', payload, opts);
}
```

```tsx
// app/hotels/pricing/PricingOptions.tsx
'use client';

import { useEffect, useState } from 'react';
import { getPricing } from '@/lib/tripjack/api';
import type { PricingOption } from '@/lib/tripjack/types';

interface Props {
  searchId: string;
  tjHotelId: string;
  checkIn: string;
  checkOut: string;
  token: string;
  tenantSlug: string;
  onSelect: (optionId: string) => void;
}

export default function PricingOptions({
  searchId, tjHotelId, checkIn, checkOut, token, tenantSlug, onSelect,
}: Props) {
  const [options, setOptions] = useState<PricingOption[]>([]);

  useEffect(() => {
    getPricing(
      { searchId, tjHotelId, checkIn, checkOut, rooms: [{ adults: 2 }], currency: 'INR' },
      { token, tenantSlug },
    ).then((res) => setOptions(res.options));
  }, [searchId, tjHotelId]);

  return (
    <ul>
      {options.map((opt) => (
        <li key={opt.optionId}>
          <strong>{opt.rooms[0]?.name}</strong> — {opt.mealPlan}
          <br />
          ₹{opt.pricing.totalPrice} (taxes: ₹{opt.pricing.taxes ?? 0})
          <br />
          {opt.cancellation.isRefundable ? '✅ Refundable' : '❌ Non-refundable'}
          <button onClick={() => onSelect(opt.optionId)}>Select</button>
        </li>
      ))}
    </ul>
  );
}
```

---

### 5.3 POST /review

Lock in a selected pricing option before booking. Returns a `reviewId` needed for `/book`.

**URL:** `POST /api/v1/tripjack/hotels/review`

**Request body:**

```json
{
  "searchId": "SID-1776677341640-jtb6iy",
  "optionId": "OPT-100000000001-01"
}
```

**Response `data`:**

```json
{
  "reviewId":    "REV-1776677346383-tsndm",
  "priceChanged": false
}
```

> If `priceChanged` is `true`, show the user the new price before proceeding to book.

**Next.js example:**

```typescript
// lib/tripjack/api.ts
import type { ReviewPayload, ReviewResult } from './types';

export async function reviewOption(
  payload: ReviewPayload,
  opts: ApiOptions,
): Promise<ReviewResult> {
  return tjPost('/review', payload, opts);
}
```

```tsx
// app/hotels/review/ReviewGate.tsx
'use client';

import { useState } from 'react';
import { reviewOption } from '@/lib/tripjack/api';

interface Props {
  searchId: string;
  optionId: string;
  token: string;
  tenantSlug: string;
  onConfirmed: (reviewId: string) => void;
}

export default function ReviewGate({ searchId, optionId, token, tenantSlug, onConfirmed }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [priceChanged, setPriceChanged] = useState(false);

  async function handleReview() {
    setStatus('loading');
    const result = await reviewOption({ searchId, optionId }, { token, tenantSlug });
    setPriceChanged(result.priceChanged);
    setStatus('done');
    if (!result.priceChanged) {
      onConfirmed(result.reviewId);
    }
  }

  return (
    <div>
      {priceChanged && (
        <div className="alert">
          Price has changed! Please review before confirming.
        </div>
      )}
      <button onClick={handleReview} disabled={status === 'loading'}>
        {status === 'loading' ? 'Confirming price...' : 'Confirm & Continue'}
      </button>
    </div>
  );
}
```

---

### 5.4 POST /book

Create the booking with traveller details. Returns `bookingId` (format: `TJS` + 12 digits) and PNR.

**URL:** `POST /api/v1/tripjack/hotels/book`

**Request body:**

```json
{
  "reviewId": "REV-1776677346383-tsndm",
  "travellerInfo": [
    {
      "title": "MR",
      "fName": "Arjun",
      "lName": "Sharma",
      "type": "ADULT"
    },
    {
      "title": "MRS",
      "fName": "Priya",
      "lName": "Sharma",
      "type": "ADULT"
    }
  ],
  "contactInfo": {
    "email": "arjun.sharma@example.com",
    "phone": "9876543210",
    "code": "91"
  },
  "paymentInfo": {
    "method": "WALLET"
  }
}
```

**Response `data` (HTTP 201):**

```json
{
  "bookingId":  "TJS016106231185",
  "pnr":        "ABC123XYZ",
  "bookingRef": "HTL-A3F9B2C",
  "status":     "CONFIRMED"
}
```

> `bookingId` is generated server-side. Save it — needed for `/booking-detail` and `/cancel`.

**Next.js example:**

```typescript
// lib/tripjack/api.ts
import type { BookPayload, BookResult } from './types';

export async function bookHotel(
  payload: BookPayload,
  opts: ApiOptions,
): Promise<BookResult> {
  return tjPost('/book', payload, opts);
}
```

```tsx
// app/hotels/booking/BookingForm.tsx
'use client';

import { useState } from 'react';
import { bookHotel } from '@/lib/tripjack/api';
import type { BookResult, Traveller } from '@/lib/tripjack/types';

interface Props {
  reviewId: string;
  token: string;
  tenantSlug: string;
  onBooked: (result: BookResult) => void;
}

export default function BookingForm({ reviewId, token, tenantSlug, onBooked }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);

    const traveller: Traveller = {
      title: fd.get('title') as 'MR' | 'MRS' | 'MS',
      fName: fd.get('fName') as string,
      lName: fd.get('lName') as string,
      type:  'ADULT',
    };

    try {
      const result = await bookHotel(
        {
          reviewId,
          travellerInfo: [traveller],
          contactInfo: {
            email: fd.get('email') as string,
            phone: fd.get('phone') as string,
            code:  '91',
          },
          paymentInfo: { method: 'WALLET' },
        },
        { token, tenantSlug },
      );
      onBooked(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <select name="title">
        <option>MR</option>
        <option>MRS</option>
        <option>MS</option>
      </select>
      <input name="fName" placeholder="First name" required />
      <input name="lName" placeholder="Last name"  required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="phone" type="tel"   placeholder="Phone (10 digits)" required />

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Booking...' : 'Confirm Booking'}
      </button>
    </form>
  );
}
```

---

### 5.5 POST /booking-detail

Retrieve the full details of a confirmed booking (for the confirmation page or My Bookings).

**URL:** `POST /api/v1/tripjack/hotels/booking-detail`

**Request body:**

```json
{
  "bookingId": "TJS016106231185"
}
```

**Response `data`:**

```json
{
  "status":     "CONFIRMED",
  "voucherUrl": "https://tj.com/v/TJS016106231185",
  "travellers": [
    { "title": "MR", "fName": "Arjun", "lName": "Sharma", "type": "ADULT" }
  ],
  "itinerary": {
    "hotelName":    "The Grand Mumbai",
    "checkInDate":  "2025-01-15",
    "checkOutDate": "2025-01-17"
  }
}
```

**Next.js example:**

```typescript
// app/hotels/confirmation/[bookingId]/page.tsx  (Server Component)
import { cookies } from 'next/headers';
import { tjPost } from '@/lib/tripjack/client';
import type { BookingDetail } from '@/lib/tripjack/types';

interface Props {
  params: { bookingId: string };
}

export default async function ConfirmationPage({ params }: Props) {
  const token      = cookies().get('access_token')?.value ?? '';
  const tenantSlug = cookies().get('tenant_slug')?.value ?? '';

  const detail = await tjPost<BookingDetail>(
    '/booking-detail',
    { bookingId: params.bookingId },
    { token, tenantSlug },
  );

  return (
    <main>
      <h1>Booking Confirmed ✅</h1>
      <p>Hotel: {detail.itinerary.hotelName}</p>
      <p>Check-in:  {detail.itinerary.checkInDate}</p>
      <p>Check-out: {detail.itinerary.checkOutDate}</p>
      <p>Status: {detail.status}</p>

      {detail.voucherUrl && (
        <a href={detail.voucherUrl} target="_blank" rel="noreferrer">
          Download Voucher
        </a>
      )}

      <h2>Travellers</h2>
      <ul>
        {detail.travellers.map((t, i) => (
          <li key={i}>{t.title} {t.fName} {t.lName}</li>
        ))}
      </ul>
    </main>
  );
}
```

---

### 5.6 POST /cancel

Cancel an existing confirmed booking.

**URL:** `POST /api/v1/tripjack/hotels/cancel`

**Request body:**

```json
{
  "bookingId": "TJS016106231185",
  "remark":    "Guest changed travel plans"
}
```

**Response `data`:**

```json
{
  "cancellationId": "CAN-A3F9B2",
  "refundAmount":   8000.0,
  "status":         "CANCELLED"
}
```

**Error cases:**

| Status | Message |
|--------|---------|
| `404` | Booking not found |
| `400` | Booking already cancelled |

**Next.js example:**

```typescript
// lib/tripjack/api.ts
import type { CancelResult } from './types';

export async function cancelBooking(
  bookingId: string,
  remark: string,
  opts: ApiOptions,
): Promise<CancelResult> {
  return tjPost('/cancel', { bookingId, remark }, opts);
}
```

```tsx
// app/hotels/booking/CancelButton.tsx
'use client';

import { useState } from 'react';
import { cancelBooking } from '@/lib/tripjack/api';

interface Props {
  bookingId: string;
  token: string;
  tenantSlug: string;
  onCancelled: (refundAmount: number) => void;
}

export default function CancelButton({ bookingId, token, tenantSlug, onCancelled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setLoading(true);
    try {
      const result = await cancelBooking(
        bookingId,
        'Cancelled by guest via portal',
        { token, tenantSlug },
      );
      onCancelled(result.refundAmount);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && <p className="text-red-500">{error}</p>}
      <button
        onClick={handleCancel}
        disabled={loading}
        className="btn-danger"
      >
        {loading ? 'Cancelling...' : 'Cancel Booking'}
      </button>
    </>
  );
}
```

---

### 5.7 GET /static-detail/:hid

Fetch static content (name, address, amenities, images) for a hotel by its TripJack hotel ID.
Use this to build hotel detail pages.

**URL:** `GET /api/v1/tripjack/hotels/static-detail/100000000001`

**No request body.** Hotel ID is in the path.

**Response `data`:**

```json
{
  "name":      "Premium Hotel India",
  "address":   "123 Main Street, Mumbai, India",
  "amenities": ["WiFi", "Pool", "Gym", "Spa", "Restaurant", "Bar"],
  "images": [
    "https://cdn.tripjack.com/hotel-1.jpg",
    "https://cdn.tripjack.com/hotel-2.jpg",
    "https://cdn.tripjack.com/hotel-3.jpg"
  ]
}
```

**Next.js example:**

```typescript
// app/hotels/[hid]/page.tsx  (Server Component)
import { cookies } from 'next/headers';
import { tjGet } from '@/lib/tripjack/client';
import type { HotelStaticDetail } from '@/lib/tripjack/types';

interface Props {
  params: { hid: string };
}

export default async function HotelDetailPage({ params }: Props) {
  const token      = cookies().get('access_token')?.value ?? '';
  const tenantSlug = cookies().get('tenant_slug')?.value ?? '';

  const hotel = await tjGet<HotelStaticDetail>(
    `/static-detail/${params.hid}`,
    { token, tenantSlug },
  );

  return (
    <article>
      <h1>{hotel.name}</h1>
      <p>{hotel.address}</p>

      <div className="images">
        {hotel.images.map((src, i) => (
          <img key={i} src={src} alt={`${hotel.name} photo ${i + 1}`} />
        ))}
      </div>

      <h2>Amenities</h2>
      <ul>
        {hotel.amenities.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </article>
  );
}
```

---

### 5.8 POST /cities

Search for city names to populate destination autocomplete inputs.

**URL:** `POST /api/v1/tripjack/hotels/cities`

**Request body:**

```json
{
  "cityName": "Mumbai"
}
```

**Response `data`:**

```json
{
  "cities": [
    { "cityCode": "1001", "cityName": "Mumbai", "country": "India" }
  ]
}
```

**Next.js example — autocomplete component:**

```typescript
// lib/tripjack/api.ts
import type { City } from './types';

export async function searchCities(
  cityName: string,
  opts: ApiOptions,
): Promise<{ cities: City[] }> {
  return tjPost('/cities', { cityName }, opts);
}
```

```tsx
// app/components/CityAutocomplete.tsx
'use client';

import { useState, useCallback } from 'react';
import { searchCities } from '@/lib/tripjack/api';
import type { City } from '@/lib/tripjack/types';

interface Props {
  token: string;
  tenantSlug: string;
  onSelect: (city: City) => void;
}

export default function CityAutocomplete({ token, tenantSlug, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<City[]>([]);

  const fetchCities = useCallback(
    async (value: string) => {
      if (value.length < 2) { setCities([]); return; }
      const res = await searchCities(value, { token, tenantSlug });
      setCities(res.cities);
    },
    [token, tenantSlug],
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          fetchCities(e.target.value);
        }}
        placeholder="Search city..."
      />
      {cities.length > 0 && (
        <ul className="autocomplete-list">
          {cities.map((c) => (
            <li
              key={c.cityCode}
              onClick={() => { onSelect(c); setQuery(c.cityName); setCities([]); }}
            >
              {c.cityName}, {c.country}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

### 5.9 GET /nationalities

Fetch the list of nationalities for guest nationality dropdowns.

**URL:** `GET /api/v1/tripjack/hotels/nationalities`

**No request body.**

**Response `data`:**

```json
{
  "nationalities": [
    { "countryId": "106", "name": "Indian" },
    { "countryId": "232", "name": "United States" },
    { "countryId": "826", "name": "United Kingdom" },
    { "countryId": "36",  "name": "Australia" },
    { "countryId": "124", "name": "Canada" }
  ]
}
```

**Next.js example:**

```typescript
// app/components/NationalitySelect.tsx  (Server Component)
import { cookies } from 'next/headers';
import { tjGet } from '@/lib/tripjack/client';
import type { Nationality } from '@/lib/tripjack/types';

export default async function NationalitySelect({ name = 'nationality' }: { name?: string }) {
  const token      = cookies().get('access_token')?.value ?? '';
  const tenantSlug = cookies().get('tenant_slug')?.value ?? '';

  const { nationalities } = await tjGet<{ nationalities: Nationality[] }>(
    '/nationalities',
    { token, tenantSlug },
  );

  return (
    <select name={name}>
      {nationalities.map((n) => (
        <option key={n.countryId} value={n.countryId}>
          {n.name}
        </option>
      ))}
    </select>
  );
}
```

---

### 5.10 GET /account/balance

Fetch the current wallet balance and credit limit. Useful for a wallet widget in the header.

**URL:** `GET /api/v1/tripjack/hotels/account/balance`

**No request body.**

**Response `data`:**

```json
{
  "balance":     50000.0,
  "creditLimit": 10000.0,
  "currency":    "INR"
}
```

**Next.js example:**

```typescript
// app/components/WalletWidget.tsx  (Server Component)
import { cookies } from 'next/headers';
import { tjGet } from '@/lib/tripjack/client';
import type { AccountBalance } from '@/lib/tripjack/types';

export default async function WalletWidget() {
  const token      = cookies().get('access_token')?.value ?? '';
  const tenantSlug = cookies().get('tenant_slug')?.value ?? '';

  const balance = await tjGet<AccountBalance>('/account/balance', { token, tenantSlug });

  return (
    <div className="wallet-widget">
      <span>Wallet: {balance.currency} {balance.balance.toLocaleString('en-IN')}</span>
      <span className="text-sm text-gray-500">
        Credit: {balance.currency} {balance.creditLimit.toLocaleString('en-IN')}
      </span>
    </div>
  );
}
```

---

## 6. Complete Booking Flow — End-to-End Example

This shows the full `search → pricing → review → book → confirmation` flow wired together
in a single Next.js page using React state.

```tsx
// app/hotels/book/HotelBookingWizard.tsx
'use client';

import { useState } from 'react';
import { searchHotels, getPricing, reviewOption, bookHotel } from '@/lib/tripjack/api';
import type {
  HotelOption, PricingOption, BookResult,
} from '@/lib/tripjack/types';

type Step = 'search' | 'pricing' | 'review' | 'book' | 'confirmed';

interface Props {
  token: string;
  tenantSlug: string;
}

export default function HotelBookingWizard({ token, tenantSlug }: Props) {
  const opts = { token, tenantSlug };

  // Flow state
  const [step, setStep]             = useState<Step>('search');
  const [error, setError]           = useState<string | null>(null);

  // IDs threaded through the flow
  const [searchId, setSearchId]     = useState('');
  const [hotels, setHotels]         = useState<HotelOption[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<HotelOption | null>(null);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<PricingOption | null>(null);
  const [reviewId, setReviewId]     = useState('');
  const [priceChanged, setPriceChanged] = useState(false);
  const [booking, setBooking]       = useState<BookResult | null>(null);

  // ── Step 1: Search ─────────────────────────────────────────────────────────

  async function handleSearch(checkIn: string, checkOut: string) {
    setError(null);
    try {
      const result = await searchHotels(
        {
          checkIn, checkOut,
          hids: ['100000000001', '100000000002', '100000000003'],
          rooms: [{ adults: 2 }],
          currency: 'INR',
          nationality: '106',
        },
        opts,
      );
      setSearchId(result.searchId);
      setHotels(result.hotels);
      setStep('pricing');
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Step 2: Pricing ────────────────────────────────────────────────────────

  async function handleHotelSelect(hotel: HotelOption) {
    setSelectedHotel(hotel);
    setError(null);
    try {
      const result = await getPricing(
        {
          searchId,
          tjHotelId: hotel.tjHotelId,
          checkIn: '2025-01-15',
          checkOut: '2025-01-17',
          rooms: [{ adults: 2 }],
          currency: 'INR',
        },
        opts,
      );
      setPricingOptions(result.options);
      setStep('review');
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Step 3: Review ─────────────────────────────────────────────────────────

  async function handleOptionSelect(option: PricingOption) {
    setSelectedOption(option);
    setError(null);
    try {
      const result = await reviewOption({ searchId, optionId: option.optionId }, opts);
      setReviewId(result.reviewId);
      setPriceChanged(result.priceChanged);
      setStep('book');
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Step 4: Book ───────────────────────────────────────────────────────────

  async function handleBook(
    fName: string, lName: string,
    email: string, phone: string,
  ) {
    setError(null);
    try {
      const result = await bookHotel(
        {
          reviewId,
          travellerInfo: [{ title: 'MR', fName, lName, type: 'ADULT' }],
          contactInfo:   { email, phone, code: '91' },
          paymentInfo:   { method: 'WALLET' },
        },
        opts,
      );
      setBooking(result);
      setStep('confirmed');
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {step === 'search' && (
        <div>
          <h2>Search Hotels</h2>
          <button onClick={() => handleSearch('2025-01-15', '2025-01-17')}>
            Search (15–17 Jan 2025, 2 adults)
          </button>
        </div>
      )}

      {step === 'pricing' && (
        <div>
          <h2>Choose a Hotel</h2>
          <ul>
            {hotels.map((h) => (
              <li key={h.tjHotelId}>
                <strong>{h.name}</strong> ⭐{h.rt}
                &nbsp;— ₹{h.option.price.totalPrice}
                <button onClick={() => handleHotelSelect(h)}>Select</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'review' && (
        <div>
          <h2>Room Options — {selectedHotel?.name}</h2>
          <ul>
            {pricingOptions.map((opt) => (
              <li key={opt.optionId}>
                {opt.rooms[0]?.name} · {opt.mealPlan}
                &nbsp;· ₹{opt.pricing.totalPrice}
                &nbsp;· {opt.cancellation.isRefundable ? 'Refundable' : 'Non-refundable'}
                <button onClick={() => handleOptionSelect(opt)}>Select</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'book' && (
        <div>
          <h2>Guest Details</h2>
          {priceChanged && <p className="warning">Price has been updated. Please confirm.</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleBook(
                fd.get('fName') as string,
                fd.get('lName') as string,
                fd.get('email') as string,
                fd.get('phone') as string,
              );
            }}
          >
            <input name="fName" placeholder="First name" required />
            <input name="lName" placeholder="Last name"  required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="phone" type="tel"   placeholder="Phone" required />
            <button type="submit">Confirm Booking</button>
          </form>
        </div>
      )}

      {step === 'confirmed' && booking && (
        <div>
          <h2>Booking Confirmed! 🎉</h2>
          <p>Booking ID: <strong>{booking.bookingId}</strong></p>
          <p>PNR: <strong>{booking.pnr}</strong></p>
          <p>Ref: {booking.bookingRef}</p>
          <p>Status: {booking.status}</p>
        </div>
      )}
    </div>
  );
}
```

---

## 7. Error Handling Patterns

All endpoints return consistent error shapes:

```json
{
  "success": false,
  "message": "Review not found"
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| `400` | Validation error (missing/invalid fields) or business logic error |
| `401` | Missing or invalid JWT token |
| `403` | Insufficient role (requires `admin` or `operator`) |
| `404` | Resource not found (invalid searchId, bookingId, etc.) |
| `500` | Server error (should not happen in normal flow) |

**Global error boundary (Next.js App Router):**

```tsx
// app/hotels/error.tsx
'use client';

export default function HotelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

**Typed error handling:**

```typescript
import { TripJackError } from '@/lib/tripjack/client';

try {
  const booking = await bookHotel(payload, opts);
} catch (err) {
  if (err instanceof TripJackError) {
    switch (err.statusCode) {
      case 400:
        // Show user-facing validation message
        showToast(err.message);
        break;
      case 404:
        // Review expired — restart from /review
        restartFromReview();
        break;
      default:
        // Generic fallback
        showToast('Booking failed. Please try again.');
    }
  }
}
```

---

## 8. Environment Setup (Next.js)

Add to your `.env.local`:

```env
NEXT_PUBLIC_BFF_URL=http://localhost:3001
```

For production:

```env
NEXT_PUBLIC_BFF_URL=https://your-bff-domain.com
```

**Recommended cookie setup** (store token after login):

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email, password, tenantSlug } = await req.json();

  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.message }, { status: res.status });

  const response = NextResponse.json({ success: true });
  response.cookies.set('access_token', data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,  // 1 hour
  });
  response.cookies.set('tenant_slug', tenantSlug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,
  });
  return response;
}
```

---

## Summary — All 10 Endpoints

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/api/v1/tripjack/hotels/search` | Search hotels by date + hotel IDs |
| 2 | `POST` | `/api/v1/tripjack/hotels/pricing` | Get room/rate options for a hotel |
| 3 | `POST` | `/api/v1/tripjack/hotels/review` | Lock in a pricing option → get reviewId |
| 4 | `POST` | `/api/v1/tripjack/hotels/book` | Book hotel with traveller details → bookingId |
| 5 | `POST` | `/api/v1/tripjack/hotels/booking-detail` | Get full booking info by bookingId |
| 6 | `POST` | `/api/v1/tripjack/hotels/cancel` | Cancel a confirmed booking |
| 7 | `GET`  | `/api/v1/tripjack/hotels/static-detail/:hid` | Hotel static info (name, images, amenities) |
| 8 | `POST` | `/api/v1/tripjack/hotels/cities` | City name autocomplete |
| 9 | `GET`  | `/api/v1/tripjack/hotels/nationalities` | Nationality list for dropdown |
| 10 | `GET` | `/api/v1/tripjack/hotels/account/balance` | Wallet balance widget |

> **Current mode:** `TRIPJACK_MODE=stub` — responses are AI-generated (Gemini Flash).
> Switch to `TRIPJACK_MODE=production` when real TripJack credentials are available.
> The API contract (URLs, request/response shapes) is identical in both modes.

---

*Sprint 04 — TripJack Hotel Integration v3.0 | Auth BFF | commit `0c9500f`*
