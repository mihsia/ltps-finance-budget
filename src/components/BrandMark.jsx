// The app's brand mark: a stylized ancient 方孔圓錢 (round coin, square hole)
// whose hole is cut into a fused "LZ" monogram (Lize) instead of a plain
// square. Kept as one inline SVG (rather than an <img> to the generated PWA
// icon) so it matches scripts/generate-pwa-icons.mjs's geometry exactly at
// any inline size without a network request.
export default function BrandMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flex: 'none' }}>
      <rect width="512" height="512" rx="128" fill="#1F5F52" />
      <circle cx="256" cy="256" r="190" fill="#C9832F" />
      <circle cx="256" cy="256" r="190" fill="none" stroke="#8A5A1E" strokeWidth="6" opacity="0.55" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#8A5A1E" strokeWidth="4" opacity="0.35" />
      <g fill="#1F5F52">
        <rect x="196" y="186" width="26" height="140" />
        <rect x="196" y="300" width="60" height="26" />
        <rect x="274" y="186" width="60" height="26" />
        <rect x="274" y="300" width="60" height="26" />
        <path d="M 334 212 L 296 300 L 274 300 L 312 212 Z" />
      </g>
    </svg>
  );
}
