// Знак проекта: две скобки и точка между ними (группа условий)
export default function BracketMark({ size = 28, className }) {
  return (
    <svg className={className} viewBox="0 0 28 28" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
      <path d="M10 5H5v18h5" />
      <path d="M18 5h5v18h-5" />
      <rect x="12" y="12" width="4" height="4" fill="currentColor" stroke="none" />
    </svg>
  );
}
