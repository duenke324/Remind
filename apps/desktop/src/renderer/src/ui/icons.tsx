import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M10 4v12M4 10h12" /></Icon>
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="9" cy="9" r="5.5" /><path d="m13 13 4 4" /></Icon>
export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
  </Icon>
)
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10M8.5 9v4.5M11.5 9v4.5" /></Icon>
)
export const ChevronIcon = (p: IconProps) => <Icon {...p}><path d="m8 5 5 5-5 5" /></Icon>
export const DotsIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="4.5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15.5" cy="10" r="1.4" />
  </Icon>
)
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.8 5.7 16l.9-4.7L3.1 8l4.8-.6z" />
  </Icon>
)
export const PageIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h6l3 3v11H6z" /><path d="M12 3v3h3M8 10h5M8 13h5" /></Icon>
)
export const SidebarIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></Icon>
)
export const RestoreIcon = (p: IconProps) => <Icon {...p}><path d="M4 10a6 6 0 1 0 2-4.5M4 4v3h3" /></Icon>
export const CopyIcon = (p: IconProps) => (
  <Icon {...p}><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></Icon>
)
export const SignOutIcon = (p: IconProps) => <Icon {...p}><path d="M8 4H5v12h3M12 7l3 3-3 3M15 10H8" /></Icon>
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="m5 10 3.5 3.5L15 7" /></Icon>
export const CloudOffIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 15h8a3 3 0 0 0 .6-5.9A4.5 4.5 0 0 0 6.2 8 3.5 3.5 0 0 0 6 15zM3 3l14 14" /></Icon>
)
export const ImageIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.5" r="1.5" /><path d="m4 15 4-4 3 3 2-2 3 3" /></Icon>
)
export const SmileIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M7 11.5a3.5 3.5 0 0 0 6 0M7.5 8h.01M12.5 8h.01" /></Icon>
)
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></Icon>
)
export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" />
  </Icon>
)
