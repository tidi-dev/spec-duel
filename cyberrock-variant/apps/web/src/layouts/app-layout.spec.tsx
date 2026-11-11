import { render, screen, within } from '@testing-library/react';
import { AppLayout } from './app-layout';

describe('AppLayout', () => {
  it('renders a main navigation with a Rooms link and the page content', () => {
    render(
      <AppLayout>
        <p>Page content</p>
      </AppLayout>,
    );

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Rooms' })).toHaveAttribute('href', '/rooms');
    expect(within(screen.getByRole('main')).getByText('Page content')).toBeInTheDocument();
  });

  it('shows a Bookings link to /bookings next to Rooms (BPG-001)', () => {
    render(
      <AppLayout>
        <p>Page content</p>
      </AppLayout>,
    );

    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Rooms', 'Bookings']);
    expect(links[1]).toHaveAttribute('href', '/bookings');
  });
});
