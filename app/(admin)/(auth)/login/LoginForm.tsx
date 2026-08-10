"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  Link,
  TextFieldRoot as TextField,
} from "@heroui/react";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { useAuthStore } from "@/lib/store/auth";

export default function LoginForm() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setFormError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();

    if (!result.success) {
      setFormError(result.error ?? "Login failed");
      return;
    }

    // The login route is shared with the storefront and no longer rejects
    // customers (Task 7.1), so the ADMIN-only rule for *this* screen lives
    // here. The session it just created is a valid customer session — dropping
    // it is what stops the redirect loop with proxy.ts, which would otherwise
    // bounce them straight back to this page from /admin/dashboard.
    if (result.data.user.role !== "ADMIN") {
      await fetch("/api/auth/logout", { method: "POST" });
      setFormError("Only administrators can access this panel");
      return;
    }

    setUser(result.data.user);
    router.push("/admin/dashboard");
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Top Oil Admin</CardTitle>
        <CardDescription>Sign in to manage your store.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
          {/* The shared login route takes a phone-or-email `identifier`, but
              an admin always signs in with an email — so this stays labelled
              and typed as one rather than offering a credential no admin has. */}
          <TextField isInvalid={!!errors.identifier} fullWidth>
            <Label>Email</Label>
            <Input type="email" autoComplete="email" {...register("identifier")} />
            <FieldError>{errors.identifier?.message}</FieldError>
          </TextField>

          <TextField isInvalid={!!errors.password} fullWidth>
            <Label>Password</Label>
            <Input type="password" autoComplete="current-password" {...register("password")} />
            <FieldError>{errors.password?.message}</FieldError>
          </TextField>

          {formError && (
            <p role="alert" className="text-danger text-sm">
              {formError}
            </p>
          )}

          <Link href="/forgot-password" className="self-end text-sm">
            Forgot password?
          </Link>

          <Button type="submit" fullWidth isDisabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
