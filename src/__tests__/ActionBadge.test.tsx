/**
 * Unit tests for ActionBadge component.
 * Tests visual rendering and accessibility attributes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionBadge } from '../components/ActionBadge';

describe('ActionBadge', () => {
  it('renders BUY with upward arrow', () => {
    render(<ActionBadge action="BUY" />);
    const badge = screen.getByTestId('action-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('↑');
    expect(badge).toHaveTextContent('BUY');
  });

  it('renders SELL with downward arrow', () => {
    render(<ActionBadge action="SELL" />);
    expect(screen.getByTestId('action-badge')).toHaveTextContent('↓');
    expect(screen.getByTestId('action-badge')).toHaveTextContent('SELL');
  });

  it('renders HOLD with dash', () => {
    render(<ActionBadge action="HOLD" />);
    expect(screen.getByTestId('action-badge')).toHaveTextContent('–');
    expect(screen.getByTestId('action-badge')).toHaveTextContent('HOLD');
  });

  it('sets data-action attribute correctly', () => {
    render(<ActionBadge action="BUY" />);
    expect(screen.getByTestId('action-badge')).toHaveAttribute('data-action', 'BUY');
  });

  it('renders unknown action without crashing', () => {
    render(<ActionBadge action="UNKNOWN" />);
    expect(screen.getByTestId('action-badge')).toBeInTheDocument();
  });

  it('defaults to sm size', () => {
    render(<ActionBadge action="BUY" />);
    // sm size uses fontSize 10px — verify no error rendering
    expect(screen.getByTestId('action-badge')).toBeInTheDocument();
  });
});
