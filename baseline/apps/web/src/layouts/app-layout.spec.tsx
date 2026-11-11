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
});
