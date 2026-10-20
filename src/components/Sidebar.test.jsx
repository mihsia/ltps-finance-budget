import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { APP_UPDATED_AT, APP_VERSION } from '../lib/appInfo';
import Sidebar from './Sidebar';

function renderSidebar(props = {}) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <Sidebar nav="dashboard" setNav={() => {}} {...props} />,
    );
  });
  return renderer;
}

function pageText(renderer) {
  return renderer.root
    .findAll((node) => typeof node.type === 'string')
    .map((node) => (node.children || []).join(''))
    .join('');
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function clickableWithText(renderer, text) {
  return renderer.root.findAll(
    (node) => typeof node.props.onClick === 'function' && textOf(node).includes(text),
  )[0];
}

describe('Sidebar version footer', () => {
  it('shows the current system version and last-updated date', () => {
    const renderer = renderSidebar();
    expect(pageText(renderer)).toContain(`v${APP_VERSION}`);
    expect(pageText(renderer)).toContain(APP_UPDATED_AT);
  });

  it('navigates to the changelog page when clicked', () => {
    const setNav = vi.fn();
    const onClose = vi.fn();
    const renderer = renderSidebar({ setNav, onClose });

    const footer = clickableWithText(renderer, `v${APP_VERSION}`);
    act(() => { footer.props.onClick(); });

    expect(setNav).toHaveBeenCalledWith('changelog');
    expect(onClose).toHaveBeenCalled();
  });
});
