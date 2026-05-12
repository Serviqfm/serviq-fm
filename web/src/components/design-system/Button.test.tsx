// src/components/design-system/Button.test.tsx

import React from 'react';
import { render } from '@testing-library/react';
import Button from './Button';

describe('Button Component', () => {
  it('renders primary button', () => {
    const { container } = render(<Button variant="primary">Click me</Button>);
    expect(container.querySelector('button')).toBeInTheDocument();
  });

  it('renders all variants', () => {
    const variants = ['primary', 'secondary', 'tertiary', 'ghost', 'danger'] as const;
    variants.forEach((variant) => {
      const { container } = render(
        <Button variant={variant}>{variant}</Button>
      );
      expect(container.querySelector('button')).toBeInTheDocument();
    });
  });

  it('handles disabled state', () => {
    const { container } = render(<Button disabled>Click me</Button>);
    expect(container.querySelector('button')).toBeDisabled();
  });

  it('renders with icon', () => {
    const { container } = render(
      <Button icon={<span>🔒</span>}>Secure</Button>
    );
    expect(container.textContent).toContain('🔒');
  });

  it('renders all sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    sizes.forEach((size) => {
      const { container } = render(
        <Button size={size}>{size}</Button>
      );
      expect(container.querySelector('button')).toBeInTheDocument();
    });
  });

  it('renders with loading state', () => {
    const { container } = render(<Button isLoading>Loading</Button>);
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
    expect(button?.textContent).toContain('...');
  });

  it('renders full width', () => {
    const { container } = render(<Button fullWidth>Full Width</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.style.width).toBe('100%');
  });

  it('accepts HTML button attributes', () => {
    const { container } = render(
      <Button id="test-btn" data-testid="custom-button">
        Click
      </Button>
    );
    const button = container.querySelector('button');
    expect(button?.id).toBe('test-btn');
    expect(button?.getAttribute('data-testid')).toBe('custom-button');
  });
});
