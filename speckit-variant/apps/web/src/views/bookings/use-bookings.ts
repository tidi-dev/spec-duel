import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto } from '@roombook/contract';
import { listBookings } from '../../services/booking.service';

type UseBookingsResult = {
  bookings: BookingDto[];
  total: number;
  loading: boolean;
  errorMessage: string | null;
  page: number;
  roomId: string | undefined;
  setPage: (page: number) => void;
  setRoomId: (roomId: string | undefined) => void;
  reload: () => void;
};

export function useBookings(): UseBookingsResult {
  const [page, setPage] = useState(1);
  const [roomId, setFilterRoomId] = useState<string | undefined>(undefined);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<PagedBookingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);
    listBookings({ page, limit: DEFAULT_PAGE_SIZE, roomId })
      .then((data) => active && setResult(data))
      .catch((error: unknown) => {
        if (!active) return;
        setResult(null);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, roomId, reloadCount]);

  const setRoomId = useCallback((nextRoomId: string | undefined): void => {
    setFilterRoomId(nextRoomId);
    setPage(1);
  }, []);

  const reload = useCallback((): void => setReloadCount((count) => count + 1), []);

  return {
    bookings: result?.items ?? [],
    total: result?.total ?? 0,
    loading,
    errorMessage,
    page,
    roomId,
    setPage,
    setRoomId,
    reload,
  };
}
