/**
 * Gemini Client
 * Wrapper around Google Generative AI (Gemini 2.0 Flash) for TripJack Hotel stub service
 * Handles LLM calls for:
 *   1. Hotel search result generation (5 realistic hotels)
 *   2. Booking confirmation generation (with TJS prefix)
 * Error fallback: hardcoded fixtures, never crash
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client at module level
const GEMINI_API_KEY = process.env['GEMINI_API_KEY'] || '';
const GEMINI_MODEL = process.env['GEMINI_MODEL'] || 'gemini-2.0-flash';

let client: GoogleGenerativeAI;

if (GEMINI_API_KEY) {
  client = new GoogleGenerativeAI(GEMINI_API_KEY);
} else {
  console.warn('[Gemini] GEMINI_API_KEY not set — stub service will use hardcoded fixtures');
}

// ─── v3.0 Type Definitions ──────────────────────────────────────────────────

export interface HotelOption {
  tjHotelId: string;
  name: string;
  img: string;
  rt: number; // rating
  option: {
    optionId: string;
    price: {
      totalPrice: number;
      currency: string;
    };
  };
}

export interface GeneratedSearchResult {
  hotels: HotelOption[];
  searchId: string;
}

export interface TravellerInfo {
  title: string; // MR, MRS, MS, etc.
  fName: string;
  lName: string;
  type: string; // ADULT, CHILD
}

export interface BookingConfirmation {
  bookingId: string;
  pnr: string;
  status: string;
  confirmation: {
    hotelName: string;
    checkInDate: string;
    checkOutDate: string;
    travellers: TravellerInfo[];
  };
}

// ─── Hardcoded Fixtures (fallback on Gemini error) ──────────────────────────

const FIXTURE_HOTELS: HotelOption[] = [
  {
    tjHotelId: '100000000001',
    name: 'The Taj Mumbai',
    img: 'https://cdn.tripjack.com/taj-mumbai.jpg',
    rt: 5,
    option: {
      optionId: 'OPT-TAJ-001',
      price: { totalPrice: 18500.0, currency: 'INR' },
    },
  },
  {
    tjHotelId: '100000000002',
    name: 'ITC Maratha Delhi',
    img: 'https://cdn.tripjack.com/itc-maratha.jpg',
    rt: 5,
    option: {
      optionId: 'OPT-ITC-001',
      price: { totalPrice: 16200.0, currency: 'INR' },
    },
  },
  {
    tjHotelId: '100000000003',
    name: 'Oberoi Bangalore',
    img: 'https://cdn.tripjack.com/oberoi-bangalore.jpg',
    rt: 4,
    option: {
      optionId: 'OPT-OBR-001',
      price: { totalPrice: 12800.0, currency: 'INR' },
    },
  },
  {
    tjHotelId: '100000000004',
    name: 'Leela Palace Goa',
    img: 'https://cdn.tripjack.com/leela-goa.jpg',
    rt: 5,
    option: {
      optionId: 'OPT-LEE-001',
      price: { totalPrice: 22000.0, currency: 'INR' },
    },
  },
  {
    tjHotelId: '100000000005',
    name: 'JW Marriott Hyderabad',
    img: 'https://cdn.tripjack.com/jw-hyderabad.jpg',
    rt: 4,
    option: {
      optionId: 'OPT-JWM-001',
      price: { totalPrice: 14500.0, currency: 'INR' },
    },
  },
];

const FIXTURE_BOOKING_CONFIRMATION: BookingConfirmation = {
  bookingId: 'TJS123456789012',
  pnr: 'ABC123XYZ',
  status: 'CONFIRMED',
  confirmation: {
    hotelName: 'Premium Hotel India',
    checkInDate: '2024-05-25',
    checkOutDate: '2024-05-27',
    travellers: [
      {
        title: 'MR',
        fName: 'John',
        lName: 'Doe',
        type: 'ADULT',
      },
    ],
  },
};

// ─── Public Methods ─────────────────────────────────────────────────────────

/**
 * Generate 5 realistic hotel options for a search query using Gemini.
 * On error: log warning and return hardcoded fixture.
 *
 * @param query - Search query with checkIn, checkOut, hids, rooms, currency, nationality
 * @returns Array of 5 HotelOption objects (v3.0 format)
 */
export async function generateSearchHotels(query: {
  checkIn: string;
  checkOut: string;
  hids: string[];
  rooms: Array<{ adults: number; children?: number }>;
  currency: string;
  nationality?: string;
}): Promise<HotelOption[]> {
  if (!client) {
    console.warn('[Gemini] Client not initialized — returning fixture hotels');
    return FIXTURE_HOTELS;
  }

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Generate 5 realistic Indian hotel options in valid JSON format for the following search:
Check-in: ${query.checkIn}
Check-out: ${query.checkOut}
Hotel IDs: ${query.hids.join(', ')}
Rooms: ${JSON.stringify(query.rooms)}
Currency: ${query.currency}

Return ONLY a valid JSON array with this exact structure (no markdown, no extra text):
[
  {
    "tjHotelId": "100000000XXX",
    "name": "Hotel Name",
    "img": "https://cdn.tripjack.com/hotel.jpg",
    "rt": 4,
    "option": {
      "optionId": "OPT-XXX-001",
      "price": {
        "totalPrice": 15000,
        "currency": "INR"
      }
    }
  }
]

Generate 5 entries with realistic Indian hotel names and prices in INR.`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Parse JSON response
    const hotels = JSON.parse(text) as HotelOption[];

    // Validate structure
    if (!Array.isArray(hotels) || hotels.length === 0) {
      throw new Error('Invalid hotel array structure');
    }

    return hotels.slice(0, 5); // Ensure exactly 5 hotels
  } catch (error) {
    console.warn('[Gemini] Hotel generation failed:', error instanceof Error ? error.message : String(error));
    return FIXTURE_HOTELS;
  }
}

/**
 * Generate a booking confirmation using Gemini.
 * On error: log warning and return hardcoded fixture.
 *
 * @param bookingDetails - Booking details (hotelName, checkInDate, checkOutDate, travellers)
 * @param bookingId - Server-generated bookingId (TJS + 12 digits)
 * @returns BookingConfirmation object (v3.0 format)
 */
export async function generateBookingConfirmation(
  bookingDetails: {
    hotelName: string;
    checkInDate: string;
    checkOutDate: string;
    travellers: TravellerInfo[];
  },
  bookingId: string
): Promise<BookingConfirmation> {
  if (!client) {
    console.warn('[Gemini] Client not initialized — returning fixture confirmation');
    return { ...FIXTURE_BOOKING_CONFIRMATION, bookingId };
  }

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Generate a realistic booking confirmation in valid JSON format for:
Hotel: ${bookingDetails.hotelName}
Check-in: ${bookingDetails.checkInDate}
Check-out: ${bookingDetails.checkOutDate}
Travellers: ${JSON.stringify(bookingDetails.travellers)}
Booking ID (already assigned): ${bookingId}

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "bookingId": "${bookingId}",
  "pnr": "ABC123XYZ",
  "status": "CONFIRMED",
  "confirmation": {
    "hotelName": "Hotel Name",
    "checkInDate": "2024-05-25",
    "checkOutDate": "2024-05-27",
    "travellers": [
      {
        "title": "MR",
        "fName": "John",
        "lName": "Doe",
        "type": "ADULT"
      }
    ]
  }
}

Generate a realistic PNR (3 letters + 6 digits or similar) and use the provided bookingId.`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Parse JSON response
    const confirmation = JSON.parse(text) as BookingConfirmation;

    // Validate structure
    if (!confirmation.bookingId || !confirmation.pnr || !confirmation.status) {
      throw new Error('Invalid confirmation structure');
    }

    // Ensure bookingId matches what was passed in
    confirmation.bookingId = bookingId;

    return confirmation;
  } catch (error) {
    console.warn('[Gemini] Booking confirmation failed:', error instanceof Error ? error.message : String(error));
    return { ...FIXTURE_BOOKING_CONFIRMATION, bookingId };
  }
}

// ─── Default Export ─────────────────────────────────────────────────────────

export default {
  generateSearchHotels,
  generateBookingConfirmation,
};
