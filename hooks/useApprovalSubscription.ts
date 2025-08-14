"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export function useApprovalSubscription() {
  const { user, refreshAuth } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to changes in user_profiles table for the current user
    const subscription = supabase
      .channel(`user_profile_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_profiles",
          filter: `id=eq.${user.id}`,
        },
        async (payload) => {
          console.log("User profile updated:", payload);

          // Check if the approved status changed
          if (payload.new && "approved" in payload.new) {
            if (payload.new.approved === true) {
              // User was approved, redirect to dashboard
              router.push("/dashboard");
            } else {
              // Refresh the profile in context
              await refreshAuth();
            }
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, refreshAuth, router]);
}
