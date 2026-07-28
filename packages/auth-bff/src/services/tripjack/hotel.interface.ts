export interface Room {
  adults: number;
  children?: number | undefined;
  childAge?: number[] | undefined;
}

export interface SearchRequest {
  checkIn: string;
  checkOut: string;
  hids: number[];
  rooms: Room[];
  currency: string;
  nationality: string;
  correlationId?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface HotelCountriesResponse {
  hotelCountries: string[];
  status: {
    success: boolean;
    message?: string;
  };
}

export interface CityRegionItem {
  cityName: string;
  cityRegionId: number;
  regionName: string;
  countryName: string;
  regionType: string;
  fullRegionName: string;
}

export interface CityRegionResponse {
  hotelCityRegionIds: CityRegionItem[];
  nextCursor?: string | undefined;
  status: {
    success: boolean;
    message?: string;
  };
}

export interface HotelMappingRequest {
  countryName?: string | undefined;
  regionIds?: string[] | undefined;
  page: number;
  size: number;
}

export interface HotelMappingItem {
  tjHotelId: string;
  unicaId: string;
}

export interface HotelMappingResponse {
  hotels: HotelMappingItem[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    offset: number;
    totalElements: number;
    totalPages: number;
    size: number;
  };
  status: {
    success: boolean;
    message?: string;
  };
}

export interface HotelContentRequest {
  hotelIds: string[];
}

export interface HotelContentItem {
  tjHotelId: string;
  unicaId: string;
  name: string;
  is_active?: boolean | undefined;
  star_rating?: string | undefined;
  property_type?: unknown;
  locale?: unknown;
  policies?: unknown;
  amenities?: unknown;
  images?: unknown;
  descriptions?: unknown;
}

export interface HotelContentResponse {
  hotels: HotelContentItem[];
  status: {
    success: boolean;
    message?: string;
  };
}

export interface HotelMappingSyncRequest {
  type: 'NEW' | 'UPDATE';
  lastUpdateTime: string;
  cursor?: string | undefined;
  page?: number | undefined;
}

export interface HotelMappingSyncResponse {
  hotels: Array<{ tjHotelId: string }>;
  pageable: {
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
  nextCursor?: string | undefined;
  status: {
    success: boolean;
    message?: string;
  };
}

export interface DeletedHotelMappingSyncRequest {
  type: 'DELETE';
  lastUpdateTime: string;
  cursor?: string | undefined;
  page?: number | undefined;
}

export interface BalanceResponse {
  balance: number;
  creditLimit: number;
  currency: string;
  status: {
    success: boolean;
    message?: string;
  };
}

export interface IHotelService {
  hotelCountries(): Promise<HotelCountriesResponse>;
  cityRegionIds(limit: number, cursor?: string): Promise<CityRegionResponse>;
  hotelMapping(req: HotelMappingRequest): Promise<HotelMappingResponse>;
  hotelContent(req: HotelContentRequest): Promise<HotelContentResponse>;
  hotelMappingSync(req: HotelMappingSyncRequest): Promise<HotelMappingSyncResponse>;
  deletedHotelMappingSync(req: DeletedHotelMappingSyncRequest): Promise<HotelMappingSyncResponse>;
  nationalities(): Promise<{ nationalities: Array<{ countryId: string; name: string }>; status: { success: boolean; message?: string } }>;
  accountBalance(): Promise<BalanceResponse>;
}
