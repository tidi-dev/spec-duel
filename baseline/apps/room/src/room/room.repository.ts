import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomEntity } from '@roombook/backend-common';
import { DEFAULT_PAGE_SIZE, PagedRoomsDto, PageQueryDto, RoomDto } from '@roombook/contract';
import { Repository } from 'typeorm';

const toRoomDto = (entity: RoomEntity): RoomDto => ({
  id: entity.id,
  name: entity.name,
  capacity: entity.capacity,
});

@Injectable()
export class RoomRepository {
  constructor(@InjectRepository(RoomEntity) private readonly rooms: Repository<RoomEntity>) {}

  async findPage(query: PageQueryDto): Promise<PagedRoomsDto> {
    const [entities, total] = await this.rooms.findAndCount({
      skip: (query.page - 1) * DEFAULT_PAGE_SIZE,
      take: query.limit,
      order: { name: 'ASC' },
    });
    return { items: entities.map(toRoomDto), total, page: query.page, limit: query.limit };
  }

  async findById(id: string): Promise<RoomDto | null> {
    const entity = await this.rooms.findOneBy({ id });
    return entity ? toRoomDto(entity) : null;
  }
}
