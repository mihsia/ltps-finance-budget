import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({
  db: { name: 'db' },
  isFirebaseConfigured: true,
}));

const {
  AwardCategoryDonut, AwardLevelBars, SpecialNeedsDonut, ClubParticipationMeter,
  CareSupportParticipationMeter, CareSupportCategoryDonut, ExpenseTrendBars, RevenueSourceDonut,
} = await import('./Report.jsx');

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

describe('SpecialNeedsDonut', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<SpecialNeedsDonut data={[]} totalStudents={262} />);
    expect(textOf(renderer.root)).toContain('尚無特生統計資料可供統計');
    expect(renderer.root.findAllByType('svg')).toHaveLength(0);
  });

  it('shows a placeholder instead of a divide-by-zero chart when total students is unavailable', () => {
    const data = [{ category: '原住民', count: 17, pct: null }];
    const renderer = render(<SpecialNeedsDonut data={data} totalStudents={0} />);
    expect(textOf(renderer.root)).toContain('尚未填寫學生人數');
    expect(renderer.root.findAllByType('svg')).toHaveLength(0);
  });

  it('renders each category as a ring segment sized to its share of the whole student body, with no NaN leaking into SVG attributes', () => {
    const data = [
      { category: '原住民', count: 17, pct: 6.5 },
      { category: '低收入戶', count: 10, pct: 3.8 },
    ];
    const renderer = render(<SpecialNeedsDonut data={data} totalStudents={262} />);
    const text = textOf(renderer.root);
    expect(text).toContain('原住民');
    expect(text).toContain('17 人');
    expect(text).toContain('（佔全體學生 6.5%）');
    expect(text).toContain('262'); // total students shown in the donut's center

    const circles = renderer.root.findAllByType('circle');
    expect(circles).toHaveLength(data.length + 1);
    for (const circle of circles.slice(1)) {
      expect(circle.props.strokeDasharray).not.toMatch(/NaN/);
      expect(circle.props.strokeDashoffset).not.toBeNaN();
    }
  });

  it('clamps slice length defensively instead of overflowing the ring when counts would sum past the total', () => {
    // Categories overlap (a student may count under more than one), so this
    // is a contrived edge case, not a realistic one — the chart must still
    // not produce a negative or NaN dasharray if it ever happens.
    const data = [
      { category: '原住民', count: 200, pct: 95 },
      { category: '新住民', count: 150, pct: 71 },
    ];
    const renderer = render(<SpecialNeedsDonut data={data} totalStudents={210} />);
    const circles = renderer.root.findAllByType('circle');
    for (const circle of circles.slice(1)) {
      const [visible] = circle.props.strokeDasharray.split(' ').map(Number);
      expect(visible).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(visible)).toBe(true);
    }
  });
});

describe('ClubParticipationMeter', () => {
  it('shows a placeholder instead of a divide-by-zero meter when total students is unavailable', () => {
    const renderer = render(<ClubParticipationMeter stats={{ totalParticipants: 57, totalStudents: 0, pct: null }} />);
    expect(textOf(renderer.root)).toContain('尚未填寫學生人數');
  });

  it('renders the participant count, student count, and percentage, with the bar fill width matching pct', () => {
    const renderer = render(<ClubParticipationMeter stats={{ totalParticipants: 57, totalStudents: 262, pct: 21.8 }} />);
    const text = textOf(renderer.root);
    expect(text).toContain('57 人次');
    expect(text).toContain('262 人');
    expect(text).toContain('21.8%');

    const fill = renderer.root.findAll((node) => node.props.style?.background === '#4F8C3E')[0];
    expect(fill.props.style.width).toBe('21.8%');
  });

  it('clamps the bar fill at 100% when participation exceeds the student count, without clamping the displayed percentage', () => {
    const renderer = render(<ClubParticipationMeter stats={{ totalParticipants: 120, totalStudents: 100, pct: 120 }} />);
    expect(textOf(renderer.root)).toContain('120%');
    const fill = renderer.root.findAll((node) => node.props.style?.background === '#4F8C3E')[0];
    expect(fill.props.style.width).toBe('100%');
  });
});

describe('CareSupportParticipationMeter', () => {
  it('shows a placeholder instead of a divide-by-zero meter when total students is unavailable', () => {
    const renderer = render(<CareSupportParticipationMeter stats={{ totalParticipants: 40, totalStudents: 0, pct: null }} />);
    expect(textOf(renderer.root)).toContain('尚未填寫學生人數');
  });

  it('renders the participant count, student count, and percentage, with the bar fill width matching pct', () => {
    const renderer = render(<CareSupportParticipationMeter stats={{ totalParticipants: 40, totalStudents: 262, pct: 15.3 }} />);
    const text = textOf(renderer.root);
    expect(text).toContain('40 人次');
    expect(text).toContain('262 人');
    expect(text).toContain('15.3%');

    const fill = renderer.root.findAll((node) => node.props.style?.background === '#D9714E')[0];
    expect(fill.props.style.width).toBe('15.3%');
  });

  it('clamps the bar fill at 100% when participation exceeds the student count, without clamping the displayed percentage', () => {
    const renderer = render(<CareSupportParticipationMeter stats={{ totalParticipants: 120, totalStudents: 100, pct: 120 }} />);
    expect(textOf(renderer.root)).toContain('120%');
    const fill = renderer.root.findAll((node) => node.props.style?.background === '#D9714E')[0];
    expect(fill.props.style.width).toBe('100%');
  });
});

describe('CareSupportCategoryDonut', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<CareSupportCategoryDonut data={[]} />);
    expect(textOf(renderer.root)).toContain('尚無課照學扶資料可供統計');
    expect(renderer.root.findAllByType('svg')).toHaveLength(0);
  });

  it('renders one ring segment plus a direct-labeled legend row per category, with no NaN leaking into SVG attributes', () => {
    const data = [
      { category: '課照班', count: 3, pct: 60 },
      { category: '學扶班', count: 1, pct: 20 },
      { category: '其他', count: 1, pct: 20 },
    ];
    const renderer = render(<CareSupportCategoryDonut data={data} />);
    const text = textOf(renderer.root);
    expect(text).toContain('課照班');
    expect(text).toContain('3 班');
    expect(text).toContain('（60%）');
    expect(text).toContain('5'); // total shown in the donut's center

    const circles = renderer.root.findAllByType('circle');
    expect(circles).toHaveLength(data.length + 1);
    for (const circle of circles.slice(1)) {
      expect(circle.props.strokeDasharray).not.toMatch(/NaN/);
      expect(circle.props.strokeDashoffset).not.toBeNaN();
    }
  });

  it('renders a single full ring without error for one category', () => {
    const renderer = render(<CareSupportCategoryDonut data={[{ category: '特教課照', count: 4, pct: 100 }]} />);
    expect(textOf(renderer.root)).toContain('特教課照');
    expect(renderer.root.findAllByType('circle')).toHaveLength(2);
  });
});

describe('ExpenseTrendBars', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<ExpenseTrendBars data={[]} />);
    expect(textOf(renderer.root)).toContain('尚無歲出資料可供統計');
  });

  it('renders one bar per year in chronological order, scaled against the largest total, with amount and YoY change', () => {
    const data = [
      { year: '113', expenseTotal: 56463, deltaPct: null },
      { year: '114', expenseTotal: 55101, deltaPct: -2.41 },
      { year: '115', expenseTotal: 54358, deltaPct: -1.35 },
    ];
    const renderer = render(<ExpenseTrendBars data={data} />);
    const text = textOf(renderer.root);
    expect(text).toContain('113年度');
    expect(text).toContain('56,463');
    expect(text).toContain('▼ 1.4%');

    const fills = renderer.root.findAll((node) => node.props.style?.background === '#1F5F52');
    expect(fills.map((f) => f.props.style.width)).toEqual(['100%', expect.any(String), expect.any(String)]);
  });

  it('shows a dash instead of a change arrow for the first (earliest) year, which has no prior year to compare', () => {
    const renderer = render(<ExpenseTrendBars data={[{ year: '113', expenseTotal: 100, deltaPct: null }]} />);
    const text = textOf(renderer.root);
    expect(text).toContain('—');
    expect(text).not.toContain('▲');
    expect(text).not.toContain('▼');
  });
});

describe('RevenueSourceDonut', () => {
  it('shows a placeholder message instead of an empty chart when there is no data', () => {
    const renderer = render(<RevenueSourceDonut data={[]} />);
    expect(textOf(renderer.root)).toContain('尚無歲入資料可供統計');
    expect(renderer.root.findAllByType('svg')).toHaveLength(0);
  });

  it('renders one ring segment plus a direct-labeled legend row per source, with no NaN leaking into SVG attributes', () => {
    const data = [
      { label: '政府撥入收入', amount: 53599, pct: 99.9 },
      { label: '租金收入', amount: 40, pct: 0.1 },
    ];
    const renderer = render(<RevenueSourceDonut data={data} />);
    const text = textOf(renderer.root);
    expect(text).toContain('政府撥入收入');
    expect(text).toContain('53,599');
    expect(text).toContain('（99.9%）');
    expect(text).toContain('53,639'); // total shown in the donut's center

    const circles = renderer.root.findAllByType('circle');
    expect(circles).toHaveLength(data.length + 1);
    for (const circle of circles.slice(1)) {
      expect(circle.props.strokeDasharray).not.toMatch(/NaN/);
      expect(circle.props.strokeDashoffset).not.toBeNaN();
    }
  });

  it('always colors a 其他 bucket neutral gray regardless of its rank', () => {
    const data = [
      { label: '其他', amount: 90, pct: 90 },
      { label: '利息收入', amount: 10, pct: 10 },
    ];
    const renderer = render(<RevenueSourceDonut data={data} />);
    const legendSwatches = renderer.root.findAll(
      (node) => node.props.style?.borderRadius === 3 && node.props.style?.background,
    );
    expect(legendSwatches[0].props.style.background).toBe('#8A9089');
  });
});
