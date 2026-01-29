"use client";

import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="border border-gray-200 rounded-2xl p-6 space-y-5">
          <h1 className="text-xl font-semibold">
            Access Required
          </h1>

          <p className="text-sm text-gray-600 leading-relaxed">
            FMG is an internal system with restricted access.
            Accounts are created by an administrator.
          </p>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700">
            If you believe you should have access, please reach out to your
            administrator or operations lead to request an invitation.
          </div>

          <div className="pt-2">
            <Link
              href="/auth/sign-in"
              className="inline-block w-full text-center rounded-xl bg-orange-800 py-2 text-white hover:bg-orange-700"
            >
              Back to sign in
            </Link>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Need help? Contact the FMG administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
