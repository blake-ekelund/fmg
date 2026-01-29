import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;

  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api");

  if (isPublicAsset) {
    return res;
  }

  // ─────────────────────────────────────
  // NOT AUTHENTICATED
  // ─────────────────────────────────────
  if (!session) {
    if (!isAuthRoute) {
      return NextResponse.redirect(
        new URL("/auth/sign-in", req.url)
      );
    }
    return res;
  }

  // ─────────────────────────────────────
  // AUTHENTICATED
  // ─────────────────────────────────────
  if (pathname === "/" || isAuthRoute) {
    return NextResponse.redirect(
      new URL("/dashboard", req.url)
    );
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
