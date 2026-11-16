import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
// Not lazy, so the router's error page never needs a piece of code to load: a page whose code did not load is one of
// its causes (#240). That failure is not a 404 — an unknown address is the `*` route at the end of `appRoutes` (#222)
import { NotFoundPage } from '@/pages/not-found';
import { RouteErrorPage } from '@/pages/route-error';

/**
 * What the router shows when a route fails. A 404 is «Такой страницы нет»; anything else — a page whose code did not
 * load or that fell while drawing — is «Экран не открылся» (#240). React Router has already logged the failure.
 */
export function RouterErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return <RouteErrorPage />;
}
