import { HomeSkeleton } from '@/widgets/home-skeleton';
import { ROUTES } from '@/shared/lib/constants/routes';
import { Loading } from '@/shared/ui/loading';

/**
 * What the app shows while it opens a screen, before the screen itself. On Home it is Home's skeleton
 * (FT-112): the same shapes from the first frame to the data, no spinner in the middle. Other screens keep
 * the spinner until they are redesigned: Home's shapes there would jump into a different layout.
 */
export function AppLoading({ pathname }: { pathname: string }) {
  return pathname === ROUTES.HOME ? <HomeSkeleton /> : <Loading fullScreen />;
}
