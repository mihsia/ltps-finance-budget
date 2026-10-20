import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MANUAL_SECTIONS } from '../lib/manualContent';
import Manual from './Manual';

describe('Manual page', () => {
  it('lists every section title and requires no module permission', () => {
    const markup = renderToStaticMarkup(<Manual />);
    MANUAL_SECTIONS.forEach((section) => {
      expect(markup).toContain(section.title);
    });
  });

  it('shows a 管理者專屬 badge for the admin-only section and no others', () => {
    const markup = renderToStaticMarkup(<Manual />);
    const adminSectionCount = MANUAL_SECTIONS.filter((section) => section.adminOnly).length;
    // Once in the 目錄 (table of contents) and once on the section heading itself.
    const badgeOccurrences = (markup.match(/管理者專屬/g) || []).length;
    expect(badgeOccurrences).toBe(adminSectionCount * 2);
  });

  it('renders every screenshot referenced in the manual content', () => {
    const markup = renderToStaticMarkup(<Manual />);
    MANUAL_SECTIONS.flatMap((section) => section.blocks)
      .filter((block) => block.type === 'image')
      .forEach((block) => {
        expect(markup).toContain(block.src);
      });
  });

  it('offers a PDF download button', () => {
    const markup = renderToStaticMarkup(<Manual />);
    expect(markup).toContain('下載 PDF 手冊');
  });
});
