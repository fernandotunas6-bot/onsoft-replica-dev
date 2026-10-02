/**
 * Primitives mobile do SIGA. Importar daqui — e não do ficheiro — mantém um só
 * ponto de entrada e evita que apareça um `StudentCardMobile2` ao lado do
 * `EntityRow` (§74).
 */
export {
  BottomSheet,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetClose,
} from "./BottomSheet";
export { ActionSheet, type SheetAction } from "./ActionSheet";
export { BottomNavigation } from "./BottomNavigation";
export { ConfirmDestructive } from "./ConfirmDestructive";
export { EntityAvatar, EntityList, EntityRow, type EntityListItem } from "./EntityList";
export {
  FilterChips,
  FilterGroup,
  FilterOption,
  FilterSheet,
  FilterTrigger,
  type FilterChip,
} from "./FilterSheet";
export { MetricCard, MetricGrid, type Metric, type MetricTone } from "./MetricGrid";
export { ContextBar, MobileHeader } from "./MobileHeader";
export { MobileSearch } from "./MobileSearch";
export { MobileTabs, type MobileTab } from "./MobileTabs";
export { MoreHub } from "./MoreHub";
export { OfflineBanner } from "./OfflineBanner";
export { PullToRefresh } from "./PullToRefresh";
export { QuickActions, type QuickAction } from "./QuickActions";
export { DesktopOnly, MobileOnly, ResponsiveEntityView } from "./ResponsiveEntityView";
export { SaveBar } from "./SaveBar";
export { SchoolSwitcherSheet } from "./SchoolSwitcherSheet";
export { MobileEmptyState, MobileErrorState } from "./states";
export {
  AgendaSkeleton,
  EntityListSkeleton,
  FormSkeleton,
  MetricGridSkeleton,
  ProfileSkeleton,
} from "./skeletons";
export {
  activeDestinationTo,
  getMobileDestinations,
  getMoreHubGroups,
  MORE_DESTINATION_TO,
  type MobileNavDestination,
  type MoreHubGroup,
} from "./mobile-nav-model";
