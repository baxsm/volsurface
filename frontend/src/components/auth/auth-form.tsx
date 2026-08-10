import { type FC, type ReactNode, useId, useState } from "react";
import { z } from "zod";

const emailSchema = z.email("Enter a valid email address.");
const passwordSchema = z.string().min(12, "Password must be at least 12 characters.");
const nameSchema = z.string().trim().min(1, "Enter your name.");

export interface AuthFormValues {
  email: string;
  password: string;
  name: string;
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  error: string | undefined;
  autoComplete: string;
  onChange: (value: string) => void;
}

const Field: FC<FieldProps> = ({ id, label, type, value, error, autoComplete, onChange }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm text-text-muted">
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      autoComplete={autoComplete}
      aria-invalid={error !== undefined}
      aria-describedby={error === undefined ? undefined : `${id}-error`}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-sm border bg-surface-2 px-3 py-2 text-sm text-text transition-colors placeholder:text-text-faint focus:outline-none ${
        error === undefined
          ? "border-border focus:border-accent-dim"
          : "border-neg focus:border-neg"
      }`}
    />
    {error !== undefined && (
      <p id={`${id}-error`} className="mt-1.5 text-xs text-neg">
        {error}
      </p>
    )}
  </div>
);

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  submitLabel: string;
  pendingLabel: string;
  footer: ReactNode;
  onSubmit: (values: AuthFormValues) => Promise<void>;
}

export const AuthForm: FC<AuthFormProps> = ({
  mode,
  submitLabel,
  pendingLabel,
  footer,
  onSubmit,
}) => {
  const ids = useId();
  const [values, setValues] = useState<AuthFormValues>({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof AuthFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // kept local rather than derived from the request promise: the promise
  // resolves before the redirect finishes, which would briefly re-enable the
  // button and allow a second submit mid-navigation.
  const [pending, setPending] = useState(false);

  const validate = (): boolean => {
    const next: Partial<Record<keyof AuthFormValues, string>> = {};
    const firstIssue = (error: z.ZodError, fallback: string): string =>
      error.issues[0]?.message ?? fallback;

    const email = emailSchema.safeParse(values.email);
    if (!email.success) next.email = firstIssue(email.error, "Enter a valid email address.");

    const password = passwordSchema.safeParse(values.password);
    if (!password.success) {
      next.password = firstIssue(password.error, "Password must be at least 12 characters.");
    }

    if (mode === "sign-up") {
      const name = nameSchema.safeParse(values.name);
      if (!name.success) next.name = firstIssue(name.error, "Enter your name.");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    if (!validate()) return;

    setPending(true);
    try {
      await onSubmit({ ...values, name: values.name.trim() });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not complete that. Try again.");
      setPending(false);
    }
  };

  const set = (key: keyof AuthFormValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {mode === "sign-up" && (
        <Field
          id={`${ids}-name`}
          label="Name"
          type="text"
          autoComplete="name"
          value={values.name}
          error={errors.name}
          onChange={set("name")}
        />
      )}
      <Field
        id={`${ids}-email`}
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        onChange={set("email")}
      />
      <Field
        id={`${ids}-password`}
        label="Password"
        type="password"
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        value={values.password}
        error={errors.password}
        onChange={set("password")}
      />

      {formError !== null && (
        <p
          role="alert"
          className="rounded-sm border border-neg/40 bg-neg/10 px-3 py-2 text-xs text-neg"
        >
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full cursor-pointer rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>

      <p className="text-center text-sm text-text-muted">{footer}</p>
    </form>
  );
};
