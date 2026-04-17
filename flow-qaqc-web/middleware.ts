import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_KEY = 'scua_user_id';

export function middleware(request: NextRequest) {
  const userId = request.cookies.get(COOKIE_KEY)?.value;

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');
  const isAppRoute  = request.nextUrl.pathname.startsWith('/app');

  if (!userId && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (userId && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/app/projects';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
