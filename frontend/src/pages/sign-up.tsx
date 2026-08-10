import { useQueryClient } from "@tanstack/react-query";
import type { FC } from "react";
import { Link, useNavigate } from "react-router";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/lib/auth";
import { sessionKey } from "@/lib/queries";
import { AuthLayout } from "./auth-layout";

export const SignUpPage: FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthLayout>
      <h2 className="text-lg tracking-tight">Create an account</h2>
      <p className="mt-1.5 mb-8 text-sm text-text-muted">
        Saving strategies needs an account. Reading chains and surfaces does not.
      </p>

      <AuthForm
        mode="sign-up"
        submitLabel="Create account"
        pendingLabel="Creating account"
        onSubmit={async ({ email, password, name }) => {
          await signUp({ email, password, name });
          await queryClient.invalidateQueries({ queryKey: sessionKey });
          await navigate("/", { replace: true });
        }}
        footer={
          <>
            Already have an account?{" "}
            <Link to="/sign-in" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        }
      />
    </AuthLayout>
  );
};
