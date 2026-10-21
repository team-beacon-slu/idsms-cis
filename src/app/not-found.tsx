import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="The link may be old, or you may not have access to this page."
        className="w-full"
        action={
          <Button asChild>
            <Link href="/">Go to dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
