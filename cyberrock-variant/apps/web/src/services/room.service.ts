import { ApiRouteEnum } from '@roombook/contract';
import type { PagedRoomsDto } from '@roombook/contract';
import { apiClient } from './api-client';

export const listRooms = async (page: number, limit: number): Promise<PagedRoomsDto> => {
  const { data } = await apiClient.get<PagedRoomsDto>(`/${ApiRouteEnum.ROOMS}`, { params: { page, limit } });
  return data;
};
