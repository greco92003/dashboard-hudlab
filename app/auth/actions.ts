"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { data: authData, error } = await supabase.auth.signInWithPassword(
    data
  );

  if (error) {
    redirect("/login?error=Invalid credentials");
  }

  // Check if user is approved
  if (authData.user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("approved")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.approved) {
      revalidatePath("/", "layout");
      redirect("/pending-approval");
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    redirect("/signup?error=Could not create account");
  }

  revalidatePath("/", "layout");
  redirect("/pending-approval");
}
