import { ChangeEvent, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import Typography from '@mui/material/Typography';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { PagedRoomsDto } from '@roombook/contract';
import { listRooms } from '../../services/room.service';
import { RoomsTable } from './rooms-table';

const ROWS_PER_PAGE_OPTIONS = [5, 10];

export function RoomsPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [result, setResult] = useState<PagedRoomsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listRooms(pageIndex + 1, rowsPerPage)
      .then((data) => active && setResult(data))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [pageIndex, rowsPerPage]);

  const handleRowsPerPageChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(Number(event.target.value));
    setPageIndex(0);
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Rooms
      </Typography>
      {loading && <LinearProgress aria-label="Loading rooms" />}
      {error && <Alert severity="error">{error}</Alert>}
      {result && !error && (
        <Paper>
          <RoomsTable rooms={result.items} />
          <TablePagination
            component="div"
            count={result.total}
            page={pageIndex}
            onPageChange={(_, nextPageIndex) => setPageIndex(nextPageIndex)}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            onRowsPerPageChange={handleRowsPerPageChange}
          />
        </Paper>
      )}
    </>
  );
}
