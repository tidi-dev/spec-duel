import { IsUUID } from 'class-validator';

export class RoomDto {
  id: string;
  name: string;
  capacity: number;
}

export class PagedRoomsDto {
  items: RoomDto[];
  total: number;
  page: number;
  limit: number;
}

export class RoomIdMessageDto {
  @IsUUID()
  id: string;
}
