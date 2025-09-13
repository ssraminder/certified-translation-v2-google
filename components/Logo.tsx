// components/Logo.tsx
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Logo">
      <circle cx="50" cy="50" r="48" fill="currentColor" opacity="0.1" />
      <text x="50" y="58" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="44" fontWeight="700">C</text>
    </svg>
  );
}
