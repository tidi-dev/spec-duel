import { IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from './page-query.dto';

export class ListBookingsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;
}
