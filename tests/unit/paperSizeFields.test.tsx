import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaperSizeFields } from '../../src/app/packages/components/PaperSizeFields';

afterEach(cleanup);

it('writes a paper size when a field is left, and clears it when emptied', () => {
  const onWidth = vi.fn();
  const onHeight = vi.fn();
  const { rerender } = render(
    <PaperSizeFields widthInches={undefined} heightInches={undefined} onWidth={onWidth} onHeight={onHeight} />,
  );
  const width = screen.getByLabelText('Width (in)');
  fireEvent.change(width, { target: { value: '36' } });
  fireEvent.blur(width);
  expect(onWidth).toHaveBeenCalledWith(36);

  rerender(<PaperSizeFields widthInches={36} heightInches={undefined} onWidth={onWidth} onHeight={onHeight} />);
  fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '' } });
  fireEvent.blur(screen.getByLabelText('Width (in)'));
  expect(onWidth).toHaveBeenCalledWith(undefined);

  fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: 'nope' } });
  fireEvent.blur(screen.getByLabelText('Width (in)'));
  expect(onWidth).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Width (in)')).toHaveProperty('value', '36');
  expect(onHeight).not.toHaveBeenCalled();
});
