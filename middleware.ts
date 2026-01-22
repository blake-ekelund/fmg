import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  if (
    path.startsWith("/sign-in") ||
    path.startsWith("/create-account") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/_next")
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: true,
            });
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[MIDDLEWARE] path:", path);
  console.log("[MIDDLEWARE] user:", user);

  if (!data.user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
