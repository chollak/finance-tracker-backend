import { HomeSkeleton } from '@/widgets/home-skeleton';
import { ROUTES } from '@/shared/lib/constants/routes';
import { LoadingScreen } from '@/shared/ui/pastel';

/**
 * What the app shows while it opens a screen, before the screen itself. On Home it is Home's skeleton
 * (FT-112): the same shapes from the first frame to the data, no spinner in the middle. Another screen gets
 * the theme's background and the Kapelka sign (#290): Home's shapes there would jump into a different layout.
 */
export function AppLoading({ pathname }: { pathname: string }) {
  return pathname === ROUTES.HOME ? <HomeSkeleton /> : <LoadingScreen />;
}
