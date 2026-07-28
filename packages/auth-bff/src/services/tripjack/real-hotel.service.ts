import axios, { AxiosError } from 'axios';
import {
  BalanceResponse,
  CityRegionResponse,
  DeletedHotelMappingSyncRequest,
  HotelContentRequest,
  HotelContentResponse,
  HotelCountriesResponse,
  HotelMappingRequest,
  HotelMappingResponse,
  HotelMappingSyncRequest,
  HotelMappingSyncResponse,
  IHotelService,
} from './hotel.interface';

const TRIPJACK_HOTEL_BASE_URL =
  process.env['TRIPJACK_HOTEL_BASE_URL'] || 'https://apitest-hms.tripjack.com';
const TRIPJACK_API_KEY = process.env['TRIPJACK_API_KEY'] || '';

const client = axios.create({
  baseURL: TRIPJACK_HOTEL_BASE_URL.replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: TRIPJACK_API_KEY,
  },
  timeout: 30000,
});

function messageFromError(error: unknown, operation: string): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    console.error(`[RealHotel] ${operation} failed:`, {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message,
    });

    return (
      axiosError.response?.data?.message ||
      axiosError.response?.data?.errors?.[0]?.description ||
      axiosError.message ||
      'TripJack hotel API error'
    );
  }

  console.error(`[RealHotel] ${operation} failed:`, error);
  return 'Unknown TripJack hotel API error';
}

export class RealHotelService implements IHotelService {
  async hotelCountries(): Promise<HotelCountriesResponse> {
    try {
      const response = await client.get('/hms/v3/content/fetch-countries');
      return {
        hotelCountries: response.data.hotelCountries || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotelCountries: [],
        status: { success: false, message: messageFromError(error, 'hotelCountries') },
      };
    }
  }

  async cityRegionIds(limit: number, cursor?: string): Promise<CityRegionResponse> {
    try {
      const response = await client.get('/hms/v3/content/fetch-city-regionIds', {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
        },
      });

      return {
        hotelCityRegionIds: response.data.hotelCityRegionIds || [],
        nextCursor: response.data.nextCursor,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotelCityRegionIds: [],
        status: { success: false, message: messageFromError(error, 'cityRegionIds') },
      };
    }
  }

  async hotelMapping(req: HotelMappingRequest): Promise<HotelMappingResponse> {
    try {
      const payload = {
        ...(req.countryName ? { countryName: req.countryName } : {}),
        ...(req.regionIds?.length ? { regionIds: req.regionIds } : {}),
        page: req.page,
        size: Math.min(req.size, 2000),
      };

      const response = await client.post('/hms/v3/content/fetch-hotel-mapping', payload);
      return {
        hotels: response.data.hotels || [],
        pageable: response.data.pageable || {
          pageNumber: req.page,
          pageSize: payload.size,
          offset: req.page * payload.size,
          totalElements: response.data.hotels?.length || 0,
          totalPages: 1,
          size: payload.size,
        },
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page,
          pageSize: Math.min(req.size, 2000),
          offset: req.page * Math.min(req.size, 2000),
          totalElements: 0,
          totalPages: 0,
          size: Math.min(req.size, 2000),
        },
        status: { success: false, message: messageFromError(error, 'hotelMapping') },
      };
    }
  }

  async hotelContent(req: HotelContentRequest): Promise<HotelContentResponse> {
    try {
      const response = await client.post('/hms/v3/content/fetch-hotel-content', {
        hotelIds: req.hotelIds.slice(0, 100),
      });

      return {
        hotels: response.data.hotels || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotels: [],
        status: { success: false, message: messageFromError(error, 'hotelContent') },
      };
    }
  }

  async hotelMappingSync(req: HotelMappingSyncRequest): Promise<HotelMappingSyncResponse> {
    try {
      const response = await client.post(
        '/hms/v3/content/fetch-hotel-mapping-sync',
        {
          type: req.type,
          lastUpdateTime: req.lastUpdateTime,
          ...(req.cursor ? { cursor: req.cursor } : {}),
        },
        {
          params: typeof req.page === 'number' ? { page: req.page } : undefined,
        }
      );

      return {
        hotels: response.data.hotels || [],
        pageable: response.data.pageable || {
          pageNumber: req.page || 0,
          pageSize: 2000,
          totalElements: response.data.hotels?.length || 0,
          totalPages: 1,
        },
        nextCursor: response.data.nextCursor,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page || 0,
          pageSize: 2000,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: messageFromError(error, 'hotelMappingSync') },
      };
    }
  }

  async deletedHotelMappingSync(req: DeletedHotelMappingSyncRequest): Promise<HotelMappingSyncResponse> {
    try {
      const response = await client.post(
        '/hms/v3/content/fetch-deleted-hotel-mapping',
        {
          type: req.type,
          lastUpdateTime: req.lastUpdateTime,
          ...(req.cursor ? { cursor: req.cursor } : {}),
        },
        {
          params: typeof req.page === 'number' ? { page: req.page } : undefined,
        }
      );

      return {
        hotels: response.data.hotels || [],
        pageable: response.data.pageable || {
          pageNumber: req.page || 0,
          pageSize: 2000,
          totalElements: response.data.hotels?.length || 0,
          totalPages: 1,
        },
        nextCursor: response.data.nextCursor,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page || 0,
          pageSize: 2000,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: messageFromError(error, 'deletedHotelMappingSync') },
      };
    }
  }

  async nationalities(): Promise<{ nationalities: Array<{ countryId: string; name: string }>; status: { success: boolean; message?: string } }> {
    try {
      const response = await client.get('/hms/v3/nationality-info');
      return {
        nationalities: response.data.nationalityInfos || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        nationalities: [],
        status: { success: false, message: messageFromError(error, 'nationalities') },
      };
    }
  }

  async accountBalance(): Promise<BalanceResponse> {
    try {
      const response = await client.get('/hms/v3/account/balance');
      return {
        balance: response.data.balance || 0,
        creditLimit: response.data.creditLimit || 0,
        currency: response.data.currency || 'INR',
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return {
        balance: 0,
        creditLimit: 0,
        currency: 'INR',
        status: { success: false, message: messageFromError(error, 'accountBalance') },
      };
    }
  }
}

export default new RealHotelService();
