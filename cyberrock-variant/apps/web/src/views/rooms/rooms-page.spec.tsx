import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import type { PagedRoomsDto, RoomDto } from '@roombook/contract';
import { listRooms } from '../../services/room.service';
import { ApiError } from '../../services/api-error';
import { RoomsPage } from './rooms-page';

jest.mock('../../services/room.service', () => ({ listRooms: jest.fn() }));

const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

const seededRooms: RoomDto[] = Array.from({ length: 12 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { id: `00000000-0000-4000-8000-0000000000${number}`, name: `Room ${number}`, capacity: (index + 1) * 2 };
});

const pageOf = (page: number, limit: number): PagedRoomsDto => ({
  items: seededRooms.slice((page - 1) * limit, page * limit),
  total: seededRooms.length,
  page,
  limit,
});

const bodyRows = () => within(screen.getByRole('table', { name: 'Rooms' })).getAllByRole('row').slice(1);

describe('RoomsPage', () => {
  beforeEach(() => {
    mockedListRooms.mockReset();
    mockedListRooms.mockImplementation((page, limit) => Promise.resolve(pageOf(page, limit)));
  });

  it('shows a loading indicator, then the 10 rows returned for page 1', async () => {
    render(<RoomsPage />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('Room 10')).toBeInTheDocument();
    expect(mockedListRooms).toHaveBeenCalledWith(1, 10);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('requests page 2 with limit 5 after choosing 5 per page and going to the next page', async () => {
    const user = userEvent.setup();
    render(<RoomsPage />);
    await screen.findByText('Room 10');

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(screen.getByRole('option', { name: '5' }));
    await waitFor(() => expect(mockedListRooms).toHaveBeenLastCalledWith(1, 5));
    await waitFor(() => expect(bodyRows()).toHaveLength(5));

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(mockedListRooms).toHaveBeenLastCalledWith(2, 5));
    expect(await screen.findByText('Room 06')).toBeInTheDocument();
  });

  it('shows the ApiError message when the request is rejected', async () => {
    mockedListRooms.mockRejectedValue(
      new ApiError({
        statusCode: 503,
        errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE,
        message: 'Room service is unavailable',
      }),
    );
    render(<RoomsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Room service is unavailable');
    expect(screen.queryByRole('table', { name: 'Rooms' })).not.toBeInTheDocument();
  });
});
