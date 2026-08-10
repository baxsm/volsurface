import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "../auth-form";

const renderForm = (
  mode: "sign-in" | "sign-up" = "sign-up",
  onSubmit = vi.fn().mockResolvedValue(undefined),
) => {
  render(
    <AuthForm
      mode={mode}
      submitLabel="Create account"
      pendingLabel="Creating account"
      footer={null}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
};

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Name"), "Ada Quant");
  await user.type(screen.getByLabelText("Email"), "ada@volsurface.test");
  await user.type(screen.getByLabelText("Password"), "surface-vol-2026");
};

describe("AuthForm", () => {
  it("asks for a name only when signing up", () => {
    renderForm("sign-in");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("rejects an empty submit without calling the server", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a password under twelve characters", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@volsurface.test");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Password must be at least 12 characters.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears a field error once the field is edited", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "A");
    expect(screen.queryByText("Enter your name.")).not.toBeInTheDocument();
  });

  it("submits trimmed values when valid", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Name"), "  Ada Quant  ");
    await user.type(screen.getByLabelText("Email"), "ada@volsurface.test");
    await user.type(screen.getByLabelText("Password"), "surface-vol-2026");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Ada Quant",
      email: "ada@volsurface.test",
      password: "surface-vol-2026",
    });
  });

  it("stays pending after a successful submit so navigation cannot be double fired", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm("sign-up", vi.fn().mockResolvedValue(undefined));

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const button = screen.getByRole("button", { name: "Creating account" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("surfaces a server error and re-enables the button", async () => {
    const user = userEvent.setup();
    renderForm("sign-up", vi.fn().mockRejectedValue(new Error("That email is taken.")));

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That email is taken.");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("does not use native validation, so zod messages are the ones shown", () => {
    const { container } = render(
      <AuthForm
        mode="sign-in"
        submitLabel="Sign in"
        pendingLabel="Signing in"
        footer={null}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.querySelector("form")).toHaveAttribute("noValidate");
  });
});
