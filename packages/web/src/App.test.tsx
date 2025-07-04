import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// Simple test component since we don't have App.tsx yet
function TestComponent() {
  return <div data-testid="test-component">Hello World</div>;
}

describe('TestComponent', () => {
  it('renders hello world message', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('test-component')).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});