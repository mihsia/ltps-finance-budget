import { describe, expect, it } from 'vitest';
import {
  attendanceSummary, calendarDays, esc, focusEvent, freshness, renderBand, renderCards, renderDetail, renderNotices, taipei,
} from './render.js';

// 2026-11-26（週四）09:40 臺北時間
const NOW = new Date('2026-11-26T01:40:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);

const students = {
  semester: '115-1',
  school: { n: 13, m: 133, f: 114, o: 0, t: 247 },
  byGrade: [{ grade: 1, n: 2, m: 24, f: 17, o: 0, t: 41 }],
  zones: [{ label: '低年級', n: 4, t: 70 }],
  classes: [{ cls: '一年忠班', grade: 1, m: 12, f: 8, o: 0, t: 20 }],
  updatedAt: minutesAgo(30),
};

describe('taipei()', () => {
  it('converts to Taipei date, time and weekday', () => {
    expect(taipei(NOW)).toMatchObject({ ymd: '2026-11-26', hm: '09:40', wd: 4, wdLabel: '週四' });
  });
});

describe('esc()', () => {
  it('escapes HTML so outside text cannot inject markup', () => {
    expect(esc('<img src=x onerror=alert(1)>&"\'')).toBe('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;');
  });
});

describe('freshness()', () => {
  it('flags calendar data older than 30 minutes', () => {
    expect(freshness('calendar', { updatedAt: minutesAgo(10) }, NOW).state).toBe('ok');
    expect(freshness('calendar', { updatedAt: minutesAgo(45) }, NOW).state).toBe('stale');
    expect(freshness('calendar', null, NOW).state).toBe('missing');
  });

  it('does not flag attendance outside school hours', () => {
    const evening = new Date('2026-11-26T11:00:00Z'); // 19:00
    expect(freshness('attendance', { updatedAt: new Date('2026-11-26T08:00:00Z') }, evening).state).toBe('ok');
    expect(freshness('attendance', { updatedAt: minutesAgo(120) }, NOW).state).toBe('stale');
  });

  it('accepts Firestore Timestamp-like values', () => {
    expect(freshness('weather', { updatedAt: { toDate: () => minutesAgo(5) } }, NOW).state).toBe('ok');
  });
});

describe('calendar', () => {
  const cal = {
    today: { date: '2026-11-25', md: '11/25', weekday: '週三', events: [{ src: 'school', t: '昨天的事', allDay: false, s: '09:00', e: '10:00' }] },
    days: [
      { date: '2026-11-26', md: '11/26', weekday: '週四', events: [
        { src: 'school', t: '音樂比賽', allDay: true, s: null, e: null, span: { from: '11/24', to: '11/28' } },
        { src: 'biz', t: '主管會議', allDay: false, s: '08:30', e: '09:30' },
        { src: 'school', t: '游泳課', allDay: false, s: '10:30', e: '12:00' },
      ] },
      { date: '2026-11-27', md: '11/27', weekday: '週五', events: [] },
    ],
    updatedAt: minutesAgo(5),
  };

  it('starts from today even when the calendar doc was written yesterday', () => {
    expect(calendarDays(cal, '2026-11-26').map((d) => d.date)).toEqual(['2026-11-26', '2026-11-27']);
  });

  it('picks the next timed event after the current time', () => {
    const f = focusEvent(calendarDays(cal, '2026-11-26'), taipei(NOW));
    expect(f.x.t).toBe('游泳課');
    expect(f.lb).toBe('下一件・50 分鐘後');
  });

  it('renders all-day spans and escapes titles', () => {
    const evil = { ...cal, days: [{ ...cal.days[0], events: [...cal.days[0].events, { src: 'school', t: '<b>x</b>', allDay: false, s: '13:00', e: '14:00' }] }] };
    const html = renderCards({ calendar: evil }, NOW).sch;
    expect(html).toContain('11/24');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('attendance', () => {
  const att = {
    date: '2026-11-26',
    roll: { total: 13, morningDone: 13, periods: [{ period: '班級點名', time: '08:00 前', done: 13, pending: 0 }] },
    leave: { approved: 3, unknown: 1, pending: 2, byType: { 病假: 3, 事假: 1 }, streaks: [{ cls: '三年仁班', type: '事假', days: 3, until: '11/28' }, { cls: '一年忠班', type: '病假', days: 1, until: '11/26' }] },
    longAbsent: { 預警長缺: { note: 'n', empty: true, classes: [] }, 長缺名單: { empty: false, classes: [{ cls: '一年孝班', n: 1 }] }, 預警中輟: { error: 'x' } },
    updatedAt: minutesAgo(5),
  };

  it('counts approved and unknown slips, lists streaks of 3+ days and long-absence classes', () => {
    const A = attendanceSummary(att, students, '2026-11-26');
    expect(A.leaveCount).toBe(4);
    expect(A.full).toBe(true);
    expect(A.rate).toBe('98.4');
    expect(A.rows.map((r) => r.cls)).toEqual(['三年仁班', '一年孝班', '預警中輟']);
    expect(A.rows[1].k).toBe('alert');
  });

  it('withholds the attendance rate until every class has taken the roll', () => {
    const A = attendanceSummary({ ...att, roll: { ...att.roll, morningDone: 9 } }, students, '2026-11-26');
    expect(A.rate).toBeNull();
    expect(renderCards({ attendance: { ...att, roll: { ...att.roll, morningDone: 9 } }, students }, NOW).att).toContain('完成前不計到校率');
  });

  it('marks data from another day', () => {
    expect(renderCards({ attendance: { ...att, date: '2026-11-25' }, students }, NOW).att).toContain('這是 2026-11-25 的資料');
  });
});

describe('band, notices and details', () => {
  it('shows fill as not connected until that document exists', () => {
    const { band, light } = renderBand({ students }, NOW);
    expect(light).toContain('線上填報尚未接上');
    expect(band).toContain('247');
    expect(renderCards({}, NOW).fill).toContain('資料尚未接上');
  });

  it('warns when 全誼 needs a new login and when office-PC data is stale', () => {
    const html = renderNotices({ _status: { zhengyi: { state: 'need-login' } }, students: { ...students, updatedAt: minutesAgo(14 * 60) } }, NOW);
    expect(html).toContain('全誼需要重新登入');
    expect(html).toContain('學生人數');
    expect(html).toContain('辦公室電腦');
  });

  it('renders every detail drawer without throwing on empty data', () => {
    for (const id of ['sch', 'att', 'fill', 'stu', 'menu', 'lib', 'wx', 'src']) {
      expect(typeof renderDetail(id, {}, NOW)).toBe('string');
    }
  });

  it('hides vegetarian duplicates on the menu card', () => {
    const menu = { found: true, date: '2026-11-26', uploadedAt: '16:21', kcal: 944, dishes: [{ type: '主食', dish: '白飯', veg: false }, { type: '主菜', dish: '(素)豆腐', veg: true }], updatedAt: minutesAgo(5) };
    const html = renderCards({ menu }, NOW).menu;
    expect(html).toContain('白飯');
    expect(html).not.toContain('(素)豆腐');
    expect(html).toContain('另有素食版');
  });
});
