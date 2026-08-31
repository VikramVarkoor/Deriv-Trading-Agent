/**
 * Unit tests for ConfidenceBar component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfidenceBar } from '../components/ConfidenceBar';

describe('ConfidenceBar', () => {
  it('renders the percentage label correctly', () => {
    render(<ConfidenceBar value={0.75} />);
    expect(screen.getByTestId('confidence-bar-label')).toHaveTextContent('75%');
  });

  it('rounds fractional values correctly', () => {
    render(<ConfidenceBar value={0.676} />);
    expect(screen.getByTestId('confidence-bar-label')).toHaveTextContent('68%');
  });

  it('renders 0% for value 0', () => {
    render(<ConfidenceBar value={0} />);
    expect(screen.getByTestId('confidence-bar-label')).toHaveTextContent('0%');
  });

  it('renders 100% for value 1', () => {
    render(<ConfidenceBar value={1} />);
    expect(screen.getByTestId('confidence-bar-label')).toHaveTextContent('100%');
  });

  it('sets bar fill width to match percentage', () => {
    render(<ConfidenceBar value={0.6} />);
    const fill = screen.getByTestId('confidence-bar-fill');
    expect(fill).toHaveStyle({ width: '60%' });
  });

  it('renders both the bar container and label', () => {
    render(<ConfidenceBar value={0.5} />);
    expect(screen.getByTestId('confidence-bar')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-bar-fill')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-bar-label')).toBeInTheDocument();
  });
});
