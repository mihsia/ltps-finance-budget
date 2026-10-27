import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useYearMeta, useYearModule, useYearRecords, updateYearReportNarrative } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtNum, fmtDate } from '../lib/format';
import { buildCouncilWorkbook } from '../lib/councilExport';
import { buildOverviewPdf, buildOverviewWorkbook } from '../lib/overviewExport';
import {
  buildOverviewReport, OPTIONAL_MODULE_DETAIL_FIELDS, OPTIONAL_MODULE_COLORS, OPTIONAL_MODULE_TILE_COLORS,
  moduleValueText as sharedModuleValueText,
} from '../lib/overviewReport';
import { buildDefaultNarratives, resolveNarratives } from '../lib/overviewNarrative';
import NarrativeField from '../components/NarrativeField';
import { languageRecordSummary } from '../lib/recordDerivations';
import { summarizeByCategory, summarizeByLevel } from '../lib/awardStats';
import { CARE_SUPPORT_CATEGORIES } from '../lib/recordSchemas';
import { summarizeSpecialNeeds } from '../lib/specialNeedsStats';
import { summarizeClubParticipation } from '../lib/clubStats';
import { summarizeRevenueSources } from '../lib/revenueStats';
import { summarizeClassesByLang } from '../lib/languageStats';
import { summarizeParcelValues } from '../lib/landStats';
import { summarizeInquiryResolution } from '../lib/inquiryStats';
import { captureChartImages } from '../lib/chartCapture';
import { runAuthorized } from '../lib/accessPolicy';
import NoModuleAccess from '../components/NoModuleAccess';
import {
  pageTitle, sectionLabel, card, btnOutline, btnPrimary, btnSecondary, chip, progressBar,
} from '../styles';

// Validated against the dataviz skill's CVD-safety checks for an all-pairs
// (every slice visually adjacent to every other) categorical context — see
// AWARD_CATEGORY_COLORS usage below. "其他" (legacy data outside the fixed
// category list) stays neutral gray rather than taking a 5th hue.
const AWARD_CATEGORY_COLORS = {
  語文類: '#2a78d6',
  藝文類: '#eda100',
  體育類: '#e87ba4',
  科學類: '#008300',
  其他: '#8A9089',
};

/** A donut chart of 獲獎紀錄 by 類別, with a direct-labeled legend (name, count, and share) so identity never rests on color alone. */
export function AwardCategoryDonut({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無獲獎資料可供統計。</div>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="獲獎項目依類別分布圓環圖">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
            {data.map((d) => {
              const length = (d.count / total) * circumference;
              // A small surface-color gap between slices reads as separation without drawing a border.
              const visibleLength = Math.max(length - 2, 0);
              const dashoffset = -drawn;
              drawn += length;
              return (
                <circle
                  key={d.category}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={AWARD_CATEGORY_COLORS[d.category] || AWARD_CATEGORY_COLORS.其他}
                  strokeWidth={ringWidth}
                  strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                  strokeDashoffset={dashoffset}
                />
              );
            })}
          </g>
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 20px Inter, sans-serif', fill: '#1E2420' }}>{total}</text>
          <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>筆獲獎</text>
        </svg>
      </div>
      {/* Legend runs full-width in a 2-column grid below the donut, rather
          than squeezed into whatever's left beside a fixed-size donut — in a
          narrow card (the 各模組現況 grid runs two cards per row) that left
          each legend line too little room and forced it to wrap, especially
          with several categories (2026-10-27 設計定案). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
        {data.map((d) => (
          <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, flex: 'none',
              background: AWARD_CATEGORY_COLORS[d.category] || AWARD_CATEGORY_COLORS.其他,
            }}
            />
            <span style={{
              font: "600 11px 'Noto Sans TC', sans-serif", color: '#1E2420',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            >
              {`${d.category}　`}{d.count} 筆<span style={{ color: '#8A9089', fontWeight: 500 }}>・{d.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A generic ranked horizontal bar list — {label, value}[] sorted however the
 * caller already sorted it, scaled against the largest value, with an
 * optional pre-formatted valueText (e.g. "120,000 元") in place of the raw
 * number. Shared by the 圖書藏書量／族語開班／土地現值 charts below instead
 * of three near-duplicate components, since all three are the same
 * "compare a handful of labeled magnitudes" job — only the data, color, and
 * wording differ (AwardLevelBars above predates this and is left as its own
 * component rather than risking a refactor of already-shipped, tested code).
 */
export function RankedBarChart({ data, color, unit = '', emptyMessage }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{emptyMessage}</div>;
  }
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto', alignItems: 'center', gap: 10 }}>
          <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#454B45' }}>{d.label}</span>
          <div style={{ height: 14, background: '#F0EEE6', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: max ? `${(d.value / max) * 100}%` : '0%', background: color, borderRadius: 7 }} />
          </div>
          <span style={{ font: '700 12px Inter, sans-serif', color: '#1E2420', textAlign: 'right' }}>{d.valueText ?? `${d.value}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

/** A horizontal bar list of 獲獎紀錄 by 等級, sorted by count — levels are free-form so there's no fixed category order to preserve, magnitude order is the useful one. */
export function AwardLevelBars({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無獲獎資料可供統計。</div>;
  }
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      {data.map((d) => (
        <div key={d.level} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 32px', alignItems: 'center', gap: 10 }}>
          <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#454B45' }}>{d.level}</span>
          <div style={{ height: 14, background: '#F0EEE6', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: '#1F5F52', borderRadius: 7 }} />
          </div>
          <span style={{ font: '700 12px Inter, sans-serif', color: '#1E2420', textAlign: 'right' }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// Fixed SPECIAL_NEEDS_CATEGORIES order (原住民/新住民/低收入戶/身障生/單親生);
// a ring-adjacent (not all-pairs) CVD check is the right standard here since
// the donut always renders these 5 in this same fixed order, so only true
// neighbors — including the wrap from 單親生 back to 原住民 — ever touch.
// All 5 ring-adjacent pairs, in both light and dark steps, clear the CVD and
// normal-vision floors. A category outside the fixed 5 (custom 其他自訂)
// falls back to neutral gray rather than a 6th hue.
const SPECIAL_NEEDS_CATEGORY_COLORS = {
  原住民: '#2a78d6',
  新住民: '#eb6834',
  低收入戶: '#1baf7a',
  身障生: '#eda100',
  單親生: '#e87ba4',
};
const SPECIAL_NEEDS_OTHER_COLOR = '#8A9089';

/** A donut chart of 特生統計 by 類別, sized to each category's share of the whole student body (not of the displayed counts, since a student can belong to more than one category) — the unfilled ring is the rest of the student body. */
export function SpecialNeedsDonut({ data, totalStudents }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無特生統計資料可供統計。</div>;
  }
  if (!totalStudents) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚未填寫學生人數（基本資料），無法計算佔全體學生的百分比。</div>;
  }
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="特生統計依類別佔全體學生百分比圓環圖">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
            {data.map((d) => {
              // Categories can overlap (a student may count under more than
              // one), so clamp each slice to whatever ring length remains
              // rather than letting the total run past a full circle.
              const rawLength = (d.count / totalStudents) * circumference;
              const length = Math.max(Math.min(rawLength, circumference - drawn), 0);
              const visibleLength = Math.max(length - 2, 0);
              const dashoffset = -drawn;
              drawn += length;
              return (
                <circle
                  key={d.category}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={SPECIAL_NEEDS_CATEGORY_COLORS[d.category] || SPECIAL_NEEDS_OTHER_COLOR}
                  strokeWidth={ringWidth}
                  strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                  strokeDashoffset={dashoffset}
                />
              );
            })}
          </g>
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 20px Inter, sans-serif', fill: '#1E2420' }}>{totalStudents}</text>
          <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>學生總數</text>
        </svg>
      </div>
      {/* Legend below the donut in a 2-column grid, full card width — see
          AwardCategoryDonut above for why (same fix, same reason); this is
          the component that actually had the problem in practice, since 特
          生統計 routinely has 6-7 categories at once. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
        {data.map((d) => (
          <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, flex: 'none',
              background: SPECIAL_NEEDS_CATEGORY_COLORS[d.category] || SPECIAL_NEEDS_OTHER_COLOR,
            }}
            />
            <span style={{
              font: "600 11px 'Noto Sans TC', sans-serif", color: '#1E2420',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            >
              {`${d.category}　`}{d.count} 人<span style={{ color: '#8A9089', fontWeight: 500 }}>・{d.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A single ratio against a limit (社團參與人次 ÷ 全體學生) reads as a
 * meter, not a pie — per the dataviz skill's own guidance table, a pie of
 * 2 slices is the wrong form for this job.
 */
export function ClubParticipationMeter({ stats }) {
  const { totalParticipants, totalStudents, pct } = stats;
  if (!totalStudents) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚未填寫學生人數（基本資料），無法計算比例。</div>;
  }
  const { track, fill } = progressBar(Math.min(pct, 100), '#4F8C3E');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
          社團參與人次 {totalParticipants} 人次／全校學生 {totalStudents} 人
        </span>
        <span style={{ font: '800 20px Inter, sans-serif', color: '#1E2420' }}>{pct}%</span>
      </div>
      <div style={track}><div style={fill} /></div>
      <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 6 }}>
        以社團參與人次計算；同一學生參加多個社團會重複計入，並非不重複學生人數。
      </div>
    </div>
  );
}

// Same fixed-order-then-gray-其他 pattern as AWARD_CATEGORY_COLORS above,
// continuing the app's categorical hue order (blue, amber, pink, …) rather
// than reusing award's own 3 hues out of order. CARE_SUPPORT_CATEGORIES'
// 3 fixed options cover 課照班／特教課照／學扶班; a custom-entered 班別類別
// (the field allows free text) folds into the same 其他 gray as elsewhere.
const CARE_SUPPORT_CATEGORY_COLORS = {
  課照班: '#2a78d6',
  特教課照: '#eda100',
  學扶班: '#e87ba4',
  其他: '#8A9089',
};

/** A donut chart of 課照學扶 by 班別類別, mirroring AwardCategoryDonut above (same slice math, direct-labeled legend) with this module's own colors and wording. */
export function CareSupportCategoryDonut({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無課照學扶資料可供統計。</div>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="課照學扶依班別類別分布圓環圖">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
          {data.map((d) => {
            const length = (d.count / total) * circumference;
            const visibleLength = Math.max(length - 2, 0);
            const dashoffset = -drawn;
            drawn += length;
            return (
              <circle
                key={d.category}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={CARE_SUPPORT_CATEGORY_COLORS[d.category] || CARE_SUPPORT_CATEGORY_COLORS.其他}
                strokeWidth={ringWidth}
                strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                strokeDashoffset={dashoffset}
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 20px Inter, sans-serif', fill: '#1E2420' }}>{total}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>班</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d) => (
          <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3, flex: 'none',
              background: CARE_SUPPORT_CATEGORY_COLORS[d.category] || CARE_SUPPORT_CATEGORY_COLORS.其他,
            }}
            />
            <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{d.category}</span>
            <span style={{ font: '700 12px Inter, sans-serif', color: '#454B45' }}>{d.count} 班</span>
            <span style={{ font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>（{d.pct}%）</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Same shape as ClubParticipationMeter above, for 課照學扶 — kept as its own component (distinct wording/color) rather than a shared one parameterized by props, matching how this file already keeps each module's chart separate. */
export function CareSupportParticipationMeter({ stats }) {
  const { totalParticipants, totalStudents, pct } = stats;
  if (!totalStudents) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚未填寫學生人數（基本資料），無法計算比例。</div>;
  }
  const { track, fill } = progressBar(Math.min(pct, 100), '#D9714E');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
          課照學扶參與人次 {totalParticipants} 人次／全校學生 {totalStudents} 人
        </span>
        <span style={{ font: '800 20px Inter, sans-serif', color: '#1E2420' }}>{pct}%</span>
      </div>
      <div style={track}><div style={fill} /></div>
      <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 6 }}>
        以課照學扶參與人次計算；同一學生參加多個班別會重複計入，並非不重複學生人數。
      </div>
    </div>
  );
}

/**
 * A meter for 議會質詢答詢 的答詢完成率 — a count-against-its-own-total
 * ratio, same job as the participation meters above, so a meter (not a
 * 2-slice donut) is the right form here too. Unlike the participation
 * meters, resolved can never exceed total (it's a subset count, not an
 * independently-entered number), so there's no need to clamp the fill
 * separately from the displayed percentage.
 */
export function InquiryResolutionMeter({ stats }) {
  const { resolved, total, pct } = stats;
  if (!total) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無議會質詢答詢資料可供統計。</div>;
  }
  const { track, fill } = progressBar(pct, '#B1456B');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
          已答詢 {resolved} 筆／共 {total} 筆
        </span>
        <span style={{ font: '800 20px Inter, sans-serif', color: '#1E2420' }}>{pct}%</span>
      </div>
      <div style={track}><div style={fill} /></div>
    </div>
  );
}

/** A horizontal bar chart of 歲出三年比較 — one teal bar per year, kept in chronological (not ranked) order since the point is the trend, not which year is biggest; amount and YoY change are read directly off each bar. */
export function ExpenseTrendBars({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無歲出資料可供統計。</div>;
  }
  const max = Math.max(...data.map((d) => d.expenseTotal));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d) => (
        <div key={d.year} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', alignItems: 'center', gap: 10 }}>
          <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#454B45' }}>{d.year}年度</span>
          <div style={{ height: 14, background: '#F0EEE6', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: max ? `${(d.expenseTotal / max) * 100}%` : '0%', background: '#1F5F52', borderRadius: 7 }} />
          </div>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ font: '700 12px Inter, sans-serif', color: '#1E2420' }}>{fmtNum(d.expenseTotal)}</span>
            <span style={{
              font: '700 11px Inter, sans-serif',
              color: d.deltaPct == null ? '#8A9089' : (d.deltaPct < 0 ? '#B5533E' : '#2F8F5B'),
              minWidth: 52, textAlign: 'right',
            }}
            >
              {d.deltaPct == null ? '—' : `${d.deltaPct < 0 ? '▼' : '▲'} ${Math.abs(d.deltaPct).toFixed(1)}%`}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Colors assigned by rank (summarizeRevenueSources already sorts by amount
// descending and folds overflow into 其他), following the dataviz skill's
// fixed categorical order — the same first-5-slot arrangement already
// validated ring-adjacent by SpecialNeedsDonut above. 其他 always takes the
// neutral gray regardless of which rank it lands on.
const REVENUE_SOURCE_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const REVENUE_OTHER_COLOR = '#8A9089';

/** A donut chart of 歲入來源 composition by amount share. */
export function RevenueSourceDonut({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無歲入資料可供統計。</div>;
  }
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;
  const colorFor = (d, i) => (d.label === '其他' ? REVENUE_OTHER_COLOR : (REVENUE_SOURCE_PALETTE[i] || REVENUE_OTHER_COLOR));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="歲入來源依比例分布圓環圖">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
            {data.map((d, i) => {
              const length = (d.amount / total) * circumference;
              const visibleLength = Math.max(length - 2, 0);
              const dashoffset = -drawn;
              drawn += length;
              return (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={colorFor(d, i)}
                  strokeWidth={ringWidth}
                  strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                  strokeDashoffset={dashoffset}
                />
              );
            })}
          </g>
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 16px Inter, sans-serif', fill: '#1E2420' }}>{fmtNum(total)}</text>
          <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>千元</text>
        </svg>
      </div>
      {/* Legend below the donut in a 2-column grid, full card width — same
          fix as AwardCategoryDonut/SpecialNeedsDonut above, applied here
          too: a fixed-size donut with its legend squeezed beside it never
          grows past that small natural width, so raising overviewExport.js's
          addChartImage size cap alone couldn't make this chart any bigger
          in the exported PDF — it only shrinks an oversized capture, never
          enlarges an already-small one (2026-10-27 設計定案，發現於使用者
          回報「財務概況的圓餅圖還是偏小」). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, flex: 'none', background: colorFor(d, i) }} />
            <span style={{
              font: "600 11px 'Noto Sans TC', sans-serif", color: '#1E2420',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            >
              {`${d.label}　`}{fmtNum(d.amount)}<span style={{ color: '#8A9089', fontWeight: 500 }}>・{d.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A pale-fill, dark-ink stat tile — the 關鍵指標 row's own look (模版 D,
// 2026-10-27 議會報表設計定案), distinct from the plain neutral `statTile`
// style shared with Dashboard.jsx so this page's colour choice doesn't leak
// into the dashboard.
function kpiTile(soft, ink) {
  return {
    tile: { background: soft, borderRadius: 12, padding: '16px 18px' },
    label: { font: "400 12px 'Noto Sans TC', sans-serif", color: ink, opacity: 0.85, marginBottom: 6 },
    value: { font: '700 24px Inter, sans-serif', color: ink },
    unit: { font: "500 12px 'Noto Sans TC', sans-serif", color: ink, opacity: 0.85 },
  };
}

/**
 * A bigger, divided header for a top-level zone of the report (財務概況／
 * 各模組現況／統計分析／匯出與紀錄) — one step up from `sectionLabel`, which
 * stays for the sub-heading inside each zone. The report has grown enough
 * sections over time that a flat run of same-weight sectionLabels reads as
 * one long undifferentiated list; this gives the eye something to group by.
 */
function ZoneHeader({ children }) {
  return (
    <div style={{
      font: "800 15px 'Noto Sans TC', sans-serif", color: '#1E2420',
      marginTop: 36, marginBottom: 14, paddingBottom: 8,
      borderBottom: '2px solid #E3DFD3',
    }}
    >
      {children}
    </div>
  );
}

const analysisCardHeading = {
  font: "700 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 14,
};

const OPTIONAL_MODULE_CHOICES = [
  { key: 'library', label: '圖書藏書量' },
  { key: 'language', label: '族語開班' },
  { key: 'specialNeeds', label: '特生統計' },
  { key: 'awards', label: '獲獎紀錄' },
  { key: 'club', label: '課後社團' },
  { key: 'careSupport', label: '課照學扶' },
  { key: 'land', label: '校地概況' },
  { key: 'inquiry', label: '議會質詢答詢' },
];

function useExportHistory(year) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const q = query(collection(db, 'years', year, 'exports'), orderBy('time', 'desc'), limit(3));
    return onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => d.data())));
  }, [year]);
  const logExport = async (name, user) => {
    await addDoc(collection(db, 'years', year, 'exports'), { name, user, time: serverTimestamp() });
  };
  return { entries, logExport };
}

// Appended to every exported file's name (e.g. "…_20261027-2125.pdf") so
// re-exporting the same report later doesn't silently overwrite — or get
// confused with — an earlier download; matches the moment the file is
// actually produced, not when its preview was opened (2026-10-27 設計定案).
function fileTimestampSuffix() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function createReportExportHandlers({
  year,
  who,
  authorizeModule,
  downloadExcel,
  downloadOverviewExcel,
  downloadPdf,
  logExport,
}) {
  return {
    exportExcel: (aligned) => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度議會報表${aligned ? '（議會格式）' : ''}_${fileTimestampSuffix()}.xlsx`;
        if (aligned) await downloadExcel(name);
        else await downloadOverviewExcel(name);
        await logExport(name, who);
      },
    ),
    exportPdf: () => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度基金總覽報表_${fileTimestampSuffix()}.pdf`;
        await downloadPdf(name);
        await logExport(name, who);
      },
    ),
  };
}

const DETAIL_ROWS_INITIAL = 6;
const DETAIL_ROWS_STEP = 10;

export default function Report({ year, years }) {
  const basicState = useYearModule(year, 'basic');
  const libraryState = useYearModule(year, 'library');
  const budgetState = useYearRecords(year, 'budget');
  const languageState = useYearRecords(year, 'language');
  const languageCertState = useYearRecords(year, 'languageCert');
  const specialNeedsState = useYearRecords(year, 'specialNeeds');
  const awardsState = useYearRecords(year, 'awards');
  const clubState = useYearRecords(year, 'club');
  const careSupportState = useYearRecords(year, 'careSupport');
  const landState = useYearRecords(year, 'land');
  const inquiryState = useYearRecords(year, 'inquiry');
  const { entries, logExport } = useExportHistory(year);
  const { profile, user, canEditModule, authorizeModule, isAdmin, authorizeAdmin } = useAuth();
  const who = profile?.name || user?.email || '未知使用者';
  const yearMetaState = useYearMeta(year);

  // Recent 3 fiscal years for the 歲出三年比較 trend and the 基金用途明細表
  // comparison columns (fixed number of hook calls, same pattern as
  // Budget.jsx's rA/rB/rC).
  const recentYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const yA = useYearRecords(recentYears[0], 'budget');
  const yB = useYearRecords(recentYears[1], 'budget');
  const yC = useYearRecords(recentYears[2], 'budget');
  const trendStates = [
    { year: recentYears[0], state: yA },
    { year: recentYears[1], state: yB },
    { year: recentYears[2], state: yC },
  ];
  const budgetRecordsByYear = {
    [recentYears[0]]: yA.data,
    [recentYears[1]]: yB.data,
    [recentYears[2]]: yC.data,
    [year]: budgetState.data,
  };

  const [selected, setSelected] = useState(
    () => Object.fromEntries(OPTIONAL_MODULE_CHOICES.map((m) => [m.key, true])),
  );
  const [preview, setPreview] = useState(null);
  // Chart capture + PDF/Excel generation can take a noticeable moment (more
  // charts, more modules) with zero visual feedback otherwise, which reads
  // as "the button didn't work" and invites repeated clicking. Which of the
  // three export buttons is running — 'excelPreview' | 'excelAligned' |
  // 'pdf' | null — same 處理中… pattern as Settings.jsx's busyUid; any
  // non-null value disables all three so two exports never overlap.
  const [exportBusy, setExportBusy] = useState(null);
  // How many of a module card's itemized detail rows are currently shown
  // (keyed by module key) — a module with many records (e.g. 34 筆獲獎紀錄)
  // used to print every row inline, making that one card (and the whole
  // page) unreasonably tall; now it starts capped and "顯示更多" reveals
  // DETAIL_ROWS_STEP more at a time (2026-10-27 設計定案).
  const [detailRowLimits, setDetailRowLimits] = useState({});
  const selectedModules = OPTIONAL_MODULE_CHOICES.map((m) => m.key).filter((key) => selected[key]);

  // DOM nodes for every chart currently on screen, keyed the same way
  // overviewExport.js's chartImages map expects ("finance.expenseTrend",
  // "module.awards", …) — captured into PNGs just before a PDF export so
  // the PDF shows the same charts as this page instead of tables alone.
  const chartRefs = useRef({});
  const setChartRef = (key) => (el) => { chartRefs.current[key] = el; };

  const sourceStates = [
    basicState, libraryState, budgetState, languageState, languageCertState, specialNeedsState,
    awardsState, clubState, careSupportState, landState, inquiryState, yA, yB, yC, yearMetaState,
  ];
  if (!canEditModule('report')) {
    return <NoModuleAccess title="議會報表匯出" />;
  }
  if (sourceStates.some((state) => state.error)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>無法載入議會報表資料，請稍後再試。</div></div>;
  }
  if (sourceStates.some((state) => state.loading)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>正在載入議會報表資料…</div></div>;
  }

  const activeExpense = (budgetState.data || []).filter((r) => r.recordType === 'expense' && !r.deletedAt);
  const activeRevenue = (budgetState.data || []).filter((r) => r.recordType === 'revenue' && !r.deletedAt);
  const activeAwards = (awardsState.data || []).filter((r) => !r.deletedAt);
  const awardCategoryStats = summarizeByCategory(activeAwards);
  const awardLevelStats = summarizeByLevel(activeAwards);
  const activeSpecialNeeds = (specialNeedsState.data || []).filter((r) => !r.deletedAt);
  const totalStudents = Number(basicState.data?.students) || 0;
  const specialNeedsStats = summarizeSpecialNeeds(activeSpecialNeeds, totalStudents);
  const activeClubs = (clubState.data || []).filter((r) => !r.deletedAt);
  const clubParticipationStats = summarizeClubParticipation(activeClubs, totalStudents);
  const activeCareSupport = (careSupportState.data || []).filter((r) => !r.deletedAt);
  const careSupportParticipationStats = summarizeClubParticipation(activeCareSupport, totalStudents);
  const careSupportCategoryStats = summarizeByCategory(activeCareSupport, CARE_SUPPORT_CATEGORIES);
  const revenueSourceStats = summarizeRevenueSources(activeRevenue);
  const libraryBookStats = libraryState.data ? [
    { label: '一般書籍', value: Number(libraryState.data.generalBooks || 0) },
    { label: '族語／原住民書籍', value: Number(libraryState.data.indigenousBooks || 0) },
  ] : [];
  const activeLanguageClasses = (languageState.data || [])
    .filter((r) => !r.deletedAt && r.recordType === 'class');
  const languageClassStats = summarizeClassesByLang(activeLanguageClasses)
    .map((d) => ({ label: d.lang, value: d.classes }));
  const activeLand = (landState.data || []).filter((r) => !r.deletedAt);
  const landValueStats = summarizeParcelValues(activeLand)
    .map((d) => ({ label: d.parcel, value: d.value, valueText: `${fmtNum(d.value)} 元` }));
  const activeInquiry = (inquiryState.data || []).filter((r) => !r.deletedAt);
  const inquiryResolutionStats = summarizeInquiryResolution(activeInquiry);

  // Each module's own chart(s), rendered inline inside its card in 各模組現況
  // rather than a separate 統計分析 zone — so a module's number and its
  // chart read together, not several scrolls apart. Every optional module
  // now has at least one chart; the right form varies by what the data's
  // job actually is (donut for a fixed-category breakdown, meter for a
  // count-against-its-own-total ratio, ranked bars for comparing a handful
  // of labeled magnitudes) rather than defaulting everything to a pie.
  const MODULE_CHARTS = {
    library: [
      { heading: '館藏組成', node: <RankedBarChart data={libraryBookStats} color={OPTIONAL_MODULE_COLORS.library} unit=" 冊" emptyMessage="尚未填寫圖書藏書資料。" /> },
    ],
    language: [
      { heading: '各語系開班數', node: <RankedBarChart data={languageClassStats} color={OPTIONAL_MODULE_COLORS.language} unit=" 班" emptyMessage="尚無族語開班資料可供統計。" /> },
    ],
    specialNeeds: [
      { heading: '佔全體學生比例', node: <SpecialNeedsDonut data={specialNeedsStats} totalStudents={totalStudents} /> },
    ],
    awards: [
      { heading: '依類別分布', node: <AwardCategoryDonut data={awardCategoryStats} /> },
      { heading: '依等級分布', node: <AwardLevelBars data={awardLevelStats} /> },
    ],
    club: [
      { heading: '參與比例', node: <ClubParticipationMeter stats={clubParticipationStats} /> },
    ],
    careSupport: [
      { heading: '依班別類別分布', node: <CareSupportCategoryDonut data={careSupportCategoryStats} /> },
      { heading: '參與比例', node: <CareSupportParticipationMeter stats={careSupportParticipationStats} /> },
    ],
    land: [
      { heading: '各地號現值', node: <RankedBarChart data={landValueStats} color={OPTIONAL_MODULE_COLORS.land} emptyMessage="尚無土地現值資料可供統計。" /> },
    ],
    inquiry: [
      { heading: '答詢完成率', node: <InquiryResolutionMeter stats={inquiryResolutionStats} /> },
    ],
  };
  const trend = trendStates.map(({ year: y, state }) => ({
    year: y,
    expenseTotal: (state.data || [])
      .filter((r) => r.recordType === 'expense' && !r.deletedAt)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0),
  }));

  const report = buildOverviewReport({
    year,
    who,
    basic: basicState.data,
    library: libraryState.data,
    expenseRows: activeExpense,
    revenueRows: activeRevenue,
    trend,
    language: languageRecordSummary([
      ...(languageState.data || []),
      ...(languageCertState.data || []),
    ]),
    specialNeedsRows: activeSpecialNeeds,
    awardsRows: activeAwards,
    clubRows: activeClubs,
    careSupportRows: activeCareSupport,
    landRows: (landState.data || []).filter((r) => !r.deletedAt),
    inquiryRows: (inquiryState.data || []).filter((r) => !r.deletedAt),
  });

  // The PDF's narrative paragraphs: a system-generated draft per zone/module
  // (buildDefaultNarratives — always derived fresh from today's report data)
  // with any admin-saved override (/years/{year}.reportNarratives) merged on
  // top, section by section. Both the live preview below and the exported
  // PDF (openPdfPreview/downloadPdf) read from this same resolved object.
  const savedNarratives = yearMetaState.meta?.reportNarratives || null;
  const defaultNarratives = buildDefaultNarratives(report);
  const narratives = resolveNarratives(defaultNarratives, savedNarratives);

  const saveNarrative = async (path, text) => {
    const result = await runAuthorized(() => authorizeAdmin(), async () => {
      await updateYearReportNarrative(year, path, text);
    });
    return result.executed ? { ok: true } : { ok: false, reason: result.reason };
  };

  const moduleValueText = (key) => sharedModuleValueText(key, report.modules[key]);

  const downloadCouncilExcel = async (name) => {
    XLSX.writeFile(buildCouncilWorkbook({ year, years: recentYears, budgetRecordsByYear }), name);
  };
  const downloadOverviewExcel = async (name) => {
    XLSX.writeFile(buildOverviewWorkbook(report, { selectedModules }), name);
  };
  const downloadPdf = async (name) => {
    const chartImages = await captureChartImages(chartRefs.current);
    const doc = await buildOverviewPdf(report, { selectedModules, chartImages, narratives });
    doc.save(name);
  };

  const { exportExcel, exportPdf } = createReportExportHandlers({
    year,
    who,
    authorizeModule,
    downloadExcel: downloadCouncilExcel,
    downloadOverviewExcel,
    downloadPdf,
    logExport,
  });

  // Preview-before-download: build the same PDF/Excel a click would export,
  // show it, and only actually download (via the authorized handlers above)
  // once the user confirms — so 匯出 never fires blind.
  const closePreview = () => {
    if (preview?.kind === 'pdf' && preview.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };
  const openPdfPreview = async () => {
    if (exportBusy) return;
    setExportBusy('pdf');
    try {
      await runAuthorized(() => authorizeModule('report'), async () => {
        const chartImages = await captureChartImages(chartRefs.current);
        const doc = await buildOverviewPdf(report, { selectedModules, chartImages, narratives });
        setPreview({ kind: 'pdf', name: `${year}年度基金總覽報表_${fileTimestampSuffix()}.pdf`, url: doc.output('bloburl') });
      });
    } finally {
      setExportBusy(null);
    }
  };
  const openExcelPreview = async () => {
    if (exportBusy) return;
    setExportBusy('excelPreview');
    try {
      await runAuthorized(() => authorizeModule('report'), async () => {
        const wb = buildOverviewWorkbook(report, { selectedModules });
        const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]);
        setPreview({ kind: 'excel', name: `${year}年度議會報表_${fileTimestampSuffix()}.xlsx`, html });
      });
    } finally {
      setExportBusy(null);
    }
  };
  const exportAlignedExcel = async () => {
    if (exportBusy) return;
    setExportBusy('excelAligned');
    try {
      await exportExcel(true);
    } finally {
      setExportBusy(null);
    }
  };
  const confirmPreview = async () => {
    const kind = preview?.kind;
    closePreview();
    if (kind === 'excel') await exportExcel(false);
    else if (kind === 'pdf') await exportPdf();
  };

  // 關鍵指標 tiles: a fixed colour per figure's own kind (expense/revenue),
  // except 本期賸餘／短絀 which flips pale-green/pale-red by sign — the
  // figure itself is the signal, not a separate delta.
  const expenseTile = kpiTile('#FBEAE2', '#7A3A1E');
  const revenueTile = kpiTile('#DCF1FF', '#0A3A80');
  const shortfallTile = report.kpi.shortfall < 0 ? kpiTile('#FBE9E5', '#831C1E') : kpiTile('#E6F5EA', '#1E6B3A');
  const studentTile = kpiTile('#F0EEE6', '#1E2420');

  return (
    <div>
      <div style={pageTitle}>議會報表匯出</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>{year}年度 · 利澤國小基金總覽（議會用）</div>

      {/* A sticky shortcut to the same 匯出 Excel／匯出 PDF actions at the
          bottom of the page (under ZoneHeader「匯出與紀錄」) — this page is
          long (財務概況／各模組現況／文字說明…), so without this, exporting
          meant scrolling all the way down every time. Stays pinned to the
          top of .app-main's own scroll area (src/index.css) as the page
          scrolls; the full 匯出與紀錄 section, including 對齊議會既有格式
          and the export history list, is unchanged at the bottom
          (2026-10-27 設計定案). */}
      <div style={{
        ...card, position: 'sticky', top: 0, zIndex: 5, maxWidth: 900, marginBottom: 20,
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, boxShadow: '0 2px 6px rgba(30,36,32,.06)',
      }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...btnOutline, opacity: exportBusy ? .6 : 1 }} onClick={exportBusy ? undefined : openExcelPreview}>
            {exportBusy === 'excelPreview' ? '處理中…' : '匯出 Excel'}
          </div>
          <div style={{ ...btnPrimary, opacity: exportBusy ? .6 : 1 }} onClick={exportBusy ? undefined : openPdfPreview}>
            {exportBusy === 'pdf' ? '處理中…' : '匯出 PDF（全貌總覽）'}
          </div>
        </div>
        <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>將依目前「選擇涵蓋模組」與「文字說明」設定匯出</div>
      </div>

      {narratives.reviewSummary && (
        <div style={{ ...card, maxWidth: 780, marginBottom: 20, borderLeft: '4px solid #1F5F52' }}>
          <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", marginBottom: 8 }}>分組審查摘要（供口頭報告用，不超過 1 分鐘）</div>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#454B45', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{narratives.reviewSummary}</div>
          <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 8 }}>內容取自下方「文字說明（PDF 用）」區塊的「分組審查摘要」，調整請至該區塊編輯。</div>
        </div>
      )}

      <div style={sectionLabel}>關鍵指標</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20, maxWidth: 900 }}>
        <div style={expenseTile.tile}>
          <div style={expenseTile.label}>{year}年度歲出預算</div>
          <div style={expenseTile.value}>{fmtNum(report.kpi.expenseTotal)}<span style={expenseTile.unit}> 千元</span></div>
        </div>
        <div style={revenueTile.tile}>
          <div style={revenueTile.label}>{year}年度歲入預算</div>
          <div style={revenueTile.value}>{fmtNum(report.kpi.revenueTotal)}<span style={revenueTile.unit}> 千元</span></div>
        </div>
        <div style={shortfallTile.tile}>
          <div style={shortfallTile.label}>本期{report.kpi.shortfall < 0 ? '短絀' : '賸餘'}</div>
          <div style={shortfallTile.value}>{fmtNum(report.kpi.shortfall)}<span style={shortfallTile.unit}> 千元</span></div>
        </div>
        <div style={studentTile.tile}>
          <div style={studentTile.label}>學生人數</div>
          <div style={studentTile.value}>{report.kpi.students ?? '—'}<span style={studentTile.unit}> 人 · {report.kpi.classes ?? '—'}班</span></div>
        </div>
      </div>

      <ZoneHeader>財務概況</ZoneHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'start', marginBottom: 8, maxWidth: 960 }}>
        <div>
          <div style={sectionLabel}>歲出三年比較（千元）</div>
          <div ref={setChartRef('finance.expenseTrend')} style={{ ...card, marginBottom: 12 }}>
            <ExpenseTrendBars data={report.trend} />
          </div>
          <div style={{ ...card, padding: 0, overflowY: 'hidden' }} className="table-scroll">
            <div style={{ minWidth: 380 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
                <span>年度</span><span>金額</span><span>較上年增減</span>
              </div>
              {report.trend.map((entry) => (
                <div key={entry.year} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif" }}>
                  <span>{entry.year}年度</span>
                  <span style={{ font: '700 13px Inter, sans-serif' }}>{fmtNum(entry.expenseTotal)}</span>
                  <span style={{ font: '700 12px Inter, sans-serif', color: entry.deltaPct == null ? '#8A9089' : (entry.deltaPct < 0 ? '#B5533E' : '#2F8F5B') }}>
                    {entry.deltaPct == null ? '—' : `${entry.deltaPct < 0 ? '▼' : '▲'} ${Math.abs(entry.deltaPct).toFixed(2)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div style={sectionLabel}>業務計畫別預算與決算（千元）</div>
          <div style={{ ...card, padding: 0, overflowY: 'hidden' }} className="table-scroll">
            <div style={{ minWidth: 500 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr', padding: '10px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
                <span>項目</span><span>預算金額</span><span>決算金額</span><span>差異原因說明</span>
              </div>
              {report.expenseVariance.rows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無歲出資料</div>}
              {report.expenseVariance.rows.map((row) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif" }}>
                  <span>{row.label}</span>
                  <span style={{ font: '700 13px Inter, sans-serif' }}>{fmtNum(row.budgetAmount)}</span>
                  <span>{row.actualAmount == null ? '—' : fmtNum(row.actualAmount)}</span>
                  <span style={{ color: '#8A9089' }}>{row.note || '—'}</span>
                </div>
              ))}
            </div>
          </div>
          {!report.expenseVariance.complete && (
            <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 8 }}>
              ＊決算數為年度結束後陸續填報，尚未全數到齊前不列入決算合計。
            </div>
          )}
        </div>

        <div>
          <div style={sectionLabel}>歲入來源（千元）</div>
          <div ref={setChartRef('finance.revenueSource')} style={{ ...card, marginBottom: 12 }}>
            <RevenueSourceDonut data={revenueSourceStats} />
          </div>
          <div style={{ ...card, padding: 0, overflowY: 'hidden' }} className="table-scroll">
            <div style={{ minWidth: 280 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
                <span>來源</span><span>金額</span>
              </div>
              {report.revenue.rows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無歲入資料</div>}
              {report.revenue.rows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif" }}>
                  <span>{row.label}</span>
                  <span style={{ font: '700 13px Inter, sans-serif' }}>{fmtNum(row.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "700 13px 'Noto Sans TC', sans-serif" }}>
                <span>合計</span><span style={{ font: '800 13px Inter, sans-serif' }}>{fmtNum(report.revenue.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ZoneHeader>各模組現況</ZoneHeader>
      <div style={sectionLabel}>選擇涵蓋模組</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, maxWidth: 960 }}>
        {OPTIONAL_MODULE_CHOICES.map((m) => (
          <div
            key={m.key}
            onClick={() => setSelected((s) => ({ ...s, [m.key]: !s[m.key] }))}
            style={{ ...chip(selected[m.key]), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
          >
            {selected[m.key] ? '☑' : '☐'} {m.label}
          </div>
        ))}
      </div>
      {/* minmax(320px, 460px), not (320px, 1fr): with 1fr, a row holding
          just one or two cards (e.g. 特生統計 alone, since it's the only
          selected module that still counts as "校務與學生") stretched that
          lone card to the row's full width — on a wide screen that's 700px+
          — and every fixed-size piece inside it (donut, legend text) stayed
          exactly as designed for ~420px, so it read as tiny against all
          that surrounding card. Capping the column's max width keeps every
          card close to the width this content was actually designed and
          tested at, leaving blank row space on wide screens instead of
          stretching cards into it (2026-10-27 設計定案). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 460px))', gap: 12, marginBottom: 24, maxWidth: 1100 }}>
        {OPTIONAL_MODULE_CHOICES.filter((m) => selected[m.key] && report.modules[m.key]).map((m) => {
          const tile = OPTIONAL_MODULE_TILE_COLORS[m.key] || { soft: '#E9F1EE', ink: '#0F3A30' };
          const fields = OPTIONAL_MODULE_DETAIL_FIELDS[m.key] || [];
          const detailRows = report.modules[m.key].rows || [];
          const columns = fields.map(() => '1fr').join(' ');
          const charts = MODULE_CHARTS[m.key];
          return (
            <div key={m.key} style={{ border: '1px solid #E3DFD3', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: tile.soft }}>
                <div style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: tile.ink, opacity: 0.85 }}>{m.label}</div>
                <div style={{ font: '800 17px Inter, sans-serif', color: tile.ink }}>{moduleValueText(m.key)}</div>
              </div>
              {charts && (
                <div ref={setChartRef(`module.${m.key}`)} style={{ padding: '4px 14px 14px', borderTop: '1px solid #EEEBE2', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {charts.map(({ heading, node }) => (
                    <div key={heading}>
                      <div style={{ ...analysisCardHeading, marginBottom: 8 }}>{heading}</div>
                      {node}
                    </div>
                  ))}
                </div>
              )}
              {detailRows.length > 0 && (() => {
                const shownCount = detailRowLimits[m.key] ?? DETAIL_ROWS_INITIAL;
                const visibleRows = detailRows.slice(0, shownCount);
                const hasMore = shownCount < detailRows.length;
                const canCollapse = !hasMore && detailRows.length > DETAIL_ROWS_INITIAL;
                return (
                  <>
                    <div style={{ borderTop: '1px solid #EEEBE2' }} className="table-scroll">
                      <div style={{ minWidth: fields.length * 110 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: columns, padding: '6px 14px', background: '#F5F3EE', font: "700 10.5px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
                          {fields.map((field) => <span key={field.key}>{field.label}</span>)}
                        </div>
                        {visibleRows.map((row, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: columns, padding: '6px 14px', borderTop: '1px solid #EEEBE2', font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
                            {fields.map((field) => <span key={field.key}>{row[field.key] == null || row[field.key] === '' ? '—' : row[field.key]}</span>)}
                          </div>
                        ))}
                      </div>
                    </div>
                    {(hasMore || canCollapse) && (
                      <div
                        onClick={() => setDetailRowLimits((prev) => ({
                          ...prev,
                          [m.key]: hasMore ? Math.min(shownCount + DETAIL_ROWS_STEP, detailRows.length) : DETAIL_ROWS_INITIAL,
                        }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px', borderTop: '1px solid #EEEBE2', background: '#F5F3EE',
                          color: tile.ink, font: "700 11.5px 'Noto Sans TC', sans-serif", cursor: 'pointer',
                        }}
                      >
                        {hasMore ? `顯示更多（還有 ${detailRows.length - shownCount} 筆）` : '收合'}
                        <span style={{ fontSize: 13 }}>{hasMore ? '▾' : '▴'}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>

      <ZoneHeader>文字說明（PDF 用）</ZoneHeader>
      <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 16, maxWidth: 780 }}>
        以下文字由系統依目前資料自動產生草稿，會寫入 PDF 匯出內容的對應段落；{isAdmin ? '可點選「編輯」調整用詞，調整後會保留到你下次按「還原為自動產生」為止。' : '僅管理者可編輯，你目前看到的是系統自動產生的草稿或管理者已儲存的文字。'}
      </div>
      <div style={{ maxWidth: 780, marginBottom: 24 }}>
        <NarrativeField
          label="分組審查摘要"
          color="#1F5F52"
          defaultText={defaultNarratives.reviewSummary}
          savedText={savedNarratives?.reviewSummary ?? null}
          canEdit={isAdmin}
          onSave={(text) => saveNarrative('reviewSummary', text)}
          onReset={() => saveNarrative('reviewSummary', '')}
        />
        <NarrativeField
          label="財務概況"
          color="#B5533E"
          defaultText={defaultNarratives.finance}
          savedText={savedNarratives?.finance ?? null}
          canEdit={isAdmin}
          onSave={(text) => saveNarrative('finance', text)}
          onReset={() => saveNarrative('finance', '')}
        />
        {report.basicProfile && (
          <NarrativeField
            label="校務資料"
            color="#C9832F"
            defaultText={defaultNarratives.basicProfile}
            savedText={savedNarratives?.basicProfile ?? null}
            canEdit={isAdmin}
            onSave={(text) => saveNarrative('basicProfile', text)}
            onReset={() => saveNarrative('basicProfile', '')}
          />
        )}
        {OPTIONAL_MODULE_CHOICES.filter((m) => selected[m.key] && report.modules[m.key]).map((m) => (
          <NarrativeField
            key={m.key}
            label={m.label}
            color={OPTIONAL_MODULE_COLORS[m.key] || '#1F5F52'}
            defaultText={defaultNarratives.modules[m.key]}
            savedText={savedNarratives?.modules?.[m.key] ?? null}
            canEdit={isAdmin}
            onSave={(text) => saveNarrative(`modules.${m.key}`, text)}
            onReset={() => saveNarrative(`modules.${m.key}`, '')}
          />
        ))}
      </div>

      <ZoneHeader>匯出與紀錄</ZoneHeader>
      <div style={sectionLabel}>匯出格式</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ ...btnOutline, opacity: exportBusy ? .6 : 1 }} onClick={exportBusy ? undefined : openExcelPreview}>
          {exportBusy === 'excelPreview' ? '處理中…' : '匯出 Excel（全貌總覽）'}
        </div>
        <div style={{ ...btnOutline, opacity: exportBusy ? .6 : 1 }} onClick={exportBusy ? undefined : exportAlignedExcel}>
          {exportBusy === 'excelAligned' ? '處理中…' : '對齊議會既有格式（.xls 範本）'}
        </div>
        <div style={{ ...btnPrimary, opacity: exportBusy ? .6 : 1 }} onClick={exportBusy ? undefined : openPdfPreview}>
          {exportBusy === 'pdf' ? '處理中…' : '匯出 PDF（全貌總覽）'}
        </div>
      </div>

      <div style={sectionLabel}>匯出紀錄</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640 }}>
        {entries.length === 0 && <div style={{ padding: '11px 18px', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無匯出紀錄</div>}
        {entries.map((eh, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderTop: '1px solid #EEEBE2', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <span>{eh.name}</span><span style={{ color: '#8A9089' }}>{fmtDate(eh.time)} · {eh.user}</span>
          </div>
        ))}
      </div>

      {preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,20,16,.45)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: 'min(920px, 100%)', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '14px 18px', borderBottom: '1px solid #E3DFD3' }}>
              <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>預覽：{preview.name}</div>
              <div style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>確認內容無誤後再下載</div>
            </div>
            {preview.kind === 'pdf' && (
              // iPad／iPhone Safari 內嵌 PDF 檢視器常只能正確捲動第一頁
              // （尤其是像這裡 iframe 又包在另一層會捲動的容器裡），不是
              // 單純調整高度能穩定解決的相容性限制，所以另外提供「在新分
              // 頁開啟」——那會用系統原生、支援完整多頁捲動的 PDF 檢視器
              // （2026-10-27 設計定案）。下方 iframe 仍保留做快速預覽。
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 18px', background: '#FDF6DC', borderBottom: '1px solid #E3DFD3', flexWrap: 'wrap' }}>
                <div style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#6B5A0A' }}>
                  若在 iPad／iPhone 上僅看得到第一頁，請改用右側按鈕在新分頁開啟完整報表
                </div>
                <div
                  style={{ ...btnOutline, padding: '6px 12px', font: "700 11.5px 'Noto Sans TC', sans-serif" }}
                  onClick={() => window.open(preview.url, '_blank', 'noopener')}
                >
                  在新分頁開啟完整報表
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflow: 'auto', background: '#F5F3EE' }} className="table-scroll">
              {preview.kind === 'pdf' ? (
                <iframe title="PDF 預覽" src={preview.url} style={{ width: '100%', height: '70vh', border: 0, display: 'block' }} />
              ) : (
                <div
                  style={{ padding: 16, font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid #E3DFD3' }}>
              <div style={btnPrimary} onClick={confirmPreview}>確認下載</div>
              <div style={btnSecondary} onClick={closePreview}>取消</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
