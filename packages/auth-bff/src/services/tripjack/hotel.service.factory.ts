import { IHotelService } from './hotel.interface';
import realHotelService from './real-hotel.service';

let hotelService: IHotelService | null = null;

export function createHotelService(): IHotelService {
  if (hotelService) {
    return hotelService;
  }

  hotelService = realHotelService;
  return hotelService;
}

export function resetHotelService(): void {
  hotelService = null;
}
