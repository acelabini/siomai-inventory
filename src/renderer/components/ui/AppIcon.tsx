import {
  Archive, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Check, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardCheck, FileChartColumn, FileUp, Info,
  LayoutDashboard, LoaderCircle, MapPin, Package, Plus, Search, Settings,
  ShoppingBasket, TriangleAlert, Trash2, X,
} from 'lucide-react';

const icons = {
  overview: LayoutDashboard,
  sale: ShoppingBasket,
  inventory: Package,
  replenish: ArrowDownToLine,
  transfer: ArrowLeftRight,
  count: ClipboardCheck,
  reports: FileChartColumn,
  products: Package,
  locations: MapPin,
  settings: Settings,
  import: FileUp,
  export: ArrowUpFromLine,
  download: ArrowDownToLine,
  plus: Plus,
  search: Search,
  check: Check,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: TriangleAlert,
  info: Info,
  help: CircleHelp,
  archive: Archive,
  trash: Trash2,
  close: X,
  next: ChevronRight,
  loading: LoaderCircle,
} as const;

export type IconName = keyof typeof icons;
export type AppIconProps = { name: IconName; size?: number; decorative?: boolean; label?: string };

export function AppIcon({ name, size = 18, decorative = true, label }: AppIconProps) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.8} className={`app-icon${name === 'loading' ? ' app-icon-loading' : ''}`}
    focusable="false" aria-hidden={decorative ? true : undefined}
    role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : (label ?? name)} />;
}

export default AppIcon;
