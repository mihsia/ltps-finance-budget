import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import * as authModule from '../contexts/AuthContext';
import Header from './Header';

function renderHeader(authValue, props = {}) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <authModule.AuthContext.Provider value={authValue}>
        <Header year="115" setYear={() => {}} years={['115']} {...props} />
      </authModule.AuthContext.Provider>,
    );
  });
  return renderer;
}

const baseAuthValue = {
  profile: { name: '夏明義', role: 'editor' },
  user: { email: 'xia@example.com' },
  logout: () => {},
};

describe('Header avatar', () => {
  it('shows the Google account photo when one is available', () => {
    const renderer = renderHeader({ ...baseAuthValue, user: { ...baseAuthValue.user, photoURL: 'https://example.com/photo.jpg' } });
    const img = renderer.root.findAllByType('img');
    expect(img).toHaveLength(1);
    expect(img[0].props.src).toBe('https://example.com/photo.jpg');
    expect(img[0].props.referrerPolicy).toBe('no-referrer');
  });

  it('falls back to an initials circle when no photo URL is available', () => {
    const renderer = renderHeader(baseAuthValue);
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    const text = renderer.root.findAll((node) => typeof node.type === 'string').map((n) => (n.children || []).join('')).join('');
    expect(text).toContain('夏');
  });

  it('falls back to the initials circle if the photo fails to load', () => {
    const renderer = renderHeader({ ...baseAuthValue, user: { ...baseAuthValue.user, photoURL: 'https://example.com/broken.jpg' } });
    expect(renderer.root.findAllByType('img')).toHaveLength(1);

    act(() => { renderer.root.findAllByType('img')[0].props.onError(); });

    expect(renderer.root.findAllByType('img')).toHaveLength(0);
  });
});
