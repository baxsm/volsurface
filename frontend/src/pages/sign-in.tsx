import { useQueryClient } from "@tanstack/react-query";
import type { FC } from "react";
import { Link, useNavigate } from "react-router";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/lib/auth";
import { sessionKey } from "@/lib/queries";
import { AuthLayout } from "./auth-layout";

export const SignInPage: FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthLayout>
      <h2 className="text-lg tracking-tight">Sign in</h2>
      <p className="mt-1.5 mb-8 text-sm text-text-muted">
        Pick up where you left off with your saved strategies.
      </p>

      <AuthForm
        mode="sign-in"
        submitLabel="Sign in"
        pendingLabel="Signing in"
        onSubmit={async ({ email, password }) => {
          await signIn({ email, password });
          await queryClient.invalidateQueries({ queryKey: sessionKey });
          await navigate("/", { replace: true });
        }}
        footer={
          <>
            No account?{" "}
            <Link to="/sign-up" className="text-accent hover:underline">
              Create one
            </Link>
          </>
        }
      />
    </AuthLayout>
  );
};
