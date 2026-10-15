import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews';

afterEach(cleanup);

it('puts toggled tags on the selected preview', () => {
  const { result } = renderHook(() => useTokenPreviews('token'));
  act(() => result.current.reset({ id: 'goblin', name: 'Goblin', imageUrl: 'goblin.webp', tags: [] }));
  act(() => {
    result.current.toggleTag('Existing');
    result.current.toggleTag('New tag');
  });
  expect(result.current.previews[0]?.tags).toEqual(['Existing', 'New tag']);
  act(() => result.current.toggleTag('Existing'));
  expect(result.current.previews[0]?.tags).toEqual(['New tag']);
});
