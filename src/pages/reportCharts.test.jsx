import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({
  db: { name: 'db' },
  isFirebaseConfigured: true,
}));

const { AwardCategoryDonut, AwardLevelBars } = await import('./Report.jsx');

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function render(element) {
  let renderer;
  act(() => { renderer = TestRenderer.create(element); });
  return renderer;
}

describe('AwardCategoryDonut', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<AwardCategoryDonut data={[]} />);
    expect(textOf(renderer.root)).toContain('尚無獲獎資料可供統計');
    expect(renderer.root.findAllByType('svg')).toHaveLength(0);
  });

  it('renders one ring segment plus a direct-labeled legend row per category, with no NaN leaking into SVG attributes', () => {
    const data = [
      { category: '語文類', count: 3, pct: 60 },
      { category: '體育類', count: 1, pct: 20 },
      { category: '其他', count: 1, pct: 20 },
    ];
    const renderer = render(<AwardCategoryDonut data={data} />);
    const text = textOf(renderer.root);
    expect(text).toContain('語文類');
    expect(text).toContain('3 筆');
    expect(text).toContain('（60%）');
    expect(text).toContain('5'); // total shown in the donut's center

    const circles = renderer.root.findAllByType('circle');
    // One background track circle plus one arc circle per data entry.
    expect(circles).toHaveLength(data.length + 1);
    for (const circle of circles.slice(1)) {
      expect(circle.props.strokeDasharray).not.toMatch(/NaN/);
      expect(circle.props.strokeDashoffset).not.toBeNaN();
    }
  });

  it('renders a single full ring without error for one category', () => {
    const renderer = render(<AwardCategoryDonut data={[{ category: '科學類', count: 7, pct: 100 }]} />);
    expect(textOf(renderer.root)).toContain('科學類');
    expect(renderer.root.findAllByType('circle')).toHaveLength(2);
  });
});

describe('AwardLevelBars', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<AwardLevelBars data={[]} />);
    expect(textOf(renderer.root)).toContain('尚無獲獎資料可供統計');
  });

  it('renders one bar row per level with the count at the tip, scaled against the largest count', () => {
    const data = [
      { level: '特優', count: 4 },
      { level: '佳作', count: 1 },
    ];
    const renderer = render(<AwardLevelBars data={data} />);
    const text = textOf(renderer.root);
    expect(text).toContain('特優');
    expect(text).toContain('佳作');

    const fills = renderer.root.findAll((node) => node.props.style?.background === '#1F5F52');
    expect(fills.map((f) => f.props.style.width)).toEqual(['100%', '25%']);
  });

  it('renders a single full-width bar without error for one level', () => {
    const renderer = render(<AwardLevelBars data={[{ level: '甲等', count: 2 }]} />);
    expect(textOf(renderer.root)).toContain('甲等');
  });
});
