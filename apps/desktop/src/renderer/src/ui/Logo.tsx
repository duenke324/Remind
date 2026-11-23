/** Marca do Remind: blocos empilhados num quadrado arredondado. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Remind" role="img" className="logo">
      <rect width="64" height="64" rx="16" fill="var(--logo-bg)" />
      <rect x="16" y="15" width="32" height="9" rx="3" fill="var(--logo-fg)" />
      <rect x="16" y="28" width="22" height="9" rx="3" fill="var(--logo-fg)" opacity="0.75" />
      <rect x="16" y="41" width="27" height="9" rx="3" fill="var(--logo-accent)" />
    </svg>
  )
}
