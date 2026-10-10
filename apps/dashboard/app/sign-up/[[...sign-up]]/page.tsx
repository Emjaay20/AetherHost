import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md mb-6">
        <Link href="/" className="inline-flex items-center text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to home
        </Link>
      </div>
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" forceRedirectUrl="/console" />
    </div>
  );
}
