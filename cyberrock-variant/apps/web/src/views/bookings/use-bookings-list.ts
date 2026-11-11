import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { PagedBookingsDto } from '@roombook/contract';
import { listBookings } from '../../services/booking.service';
import { errorMessage } from './error-message';

const lastPageOf = (result: PagedBookingsDto): number => Math.max(1, Math.ceil(result.total / result.limit));

export function useBookingsList() {
  const [page, setPage] = useState(1);
  const [roomId, setRoomId] = useState('');
  const [fetchCount, setFetchCount] = useState(0);
  const [result, setResult] = useState<PagedBookingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listBookings({ page, limit: DEFAULT_PAGE_SIZE, ...(roomId && { roomId }) })
      .then((data) => {
        if (!active) return;
        if (data.items.length === 0 && page > lastPageOf(data)) {
          setPage(lastPageOf(data));
          return;
        }
        setResult(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, roomId, fetchCount]);

  const filterByRoom = useCallback((nextRoomId: string) => {
    setRoomId(nextRoomId);
    setPage(1);
  }, []);

  const refetch = useCallback(() => setFetchCount((count) => count + 1), []);

  return { roomId, result, loading, error, goToPage: setPage, filterByRoom, refetch };
}
