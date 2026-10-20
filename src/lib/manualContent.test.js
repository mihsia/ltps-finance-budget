import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MANUAL_SECTIONS, MANUAL_LAST_REVIEWED_VERSION } from './manualContent';

describe('MANUAL_SECTIONS', () => {
  it('gives every section a unique id and a non-empty title and block list', () => {
    const ids = MANUAL_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    MANUAL_SECTIONS.forEach((section) => {
      expect(section.title).toBeTruthy();
      expect(section.blocks.length).toBeGreaterThan(0);
    });
  });

  it('only uses known block types with the fields each type needs', () => {
    const KNOWN_TYPES = new Set(['p', 'steps', 'image', 'note']);
    MANUAL_SECTIONS.flatMap((section) => section.blocks).forEach((block) => {
      expect(KNOWN_TYPES.has(block.type)).toBe(true);
      if (block.type === 'p' || block.type === 'note') expect(block.text).toBeTruthy();
      if (block.type === 'steps') expect(block.items.length).toBeGreaterThan(0);
      if (block.type === 'image') {
        expect(block.src).toBeTruthy();
        expect(block.alt).toBeTruthy();
      }
    });
  });

  it('references only screenshot files that actually exist under public/manual', () => {
    const imageBlocks = MANUAL_SECTIONS.flatMap((section) => section.blocks).filter((b) => b.type === 'image');
    expect(imageBlocks.length).toBeGreaterThan(0);
    imageBlocks.forEach((block) => {
      const filePath = fileURLToPath(new URL(`../../public${block.src}`, import.meta.url));
      expect(fs.existsSync(filePath), `missing screenshot file for ${block.src}`).toBe(true);
    });
  });

  it('records a last-reviewed version string', () => {
    expect(MANUAL_LAST_REVIEWED_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('flags the 帳號管理 section as admin-only', () => {
    const settingsSection = MANUAL_SECTIONS.find((section) => section.id === 'settings');
    expect(settingsSection?.adminOnly).toBe(true);
  });
});
