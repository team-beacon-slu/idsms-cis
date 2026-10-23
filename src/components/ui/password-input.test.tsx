/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "./password-input";

function setup() {
  render(
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" autoComplete="current-password" aria-describedby="pw-error" />
      <button type="submit">Sign in</button>
    </form>
  );
  return {
    input: screen.getByLabelText("Password") as HTMLInputElement,
    toggle: screen.getByRole("button", { name: /show password/i }),
  };
}

it("shows and hides the password, with the state on the button", () => {
  const { input, toggle } = setup();
  expect(input.type).toBe("password");
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle).toHaveAttribute("aria-controls", "pw");

  fireEvent.click(toggle);
  expect(input.type).toBe("text");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Your password is shown")).toBeInTheDocument();
  expect(input).toHaveAttribute("autocomplete", "current-password");
});

it("hides the password again when the form is submitted", () => {
  const { input, toggle } = setup();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(input.type).toBe("password");
});

it("warns while Caps Lock is on and links the hint to the field", () => {
  const { input } = setup();
  fireEvent.keyUp(input, { key: "A", modifierCapsLock: true });
  expect(screen.getByText("Caps Lock is on")).toBeInTheDocument();
  expect(input.getAttribute("aria-describedby")).toBe("pw-error pw-caps");

  fireEvent.keyUp(input, { key: "a", modifierCapsLock: false });
  expect(screen.queryByText("Caps Lock is on")).not.toBeInTheDocument();
  expect(input.getAttribute("aria-describedby")).toBe("pw-error");
});

it("never blocks paste", () => {
  const { input } = setup();
  const notCancelled = fireEvent.paste(input, { clipboardData: { getData: () => "secret" } });
  expect(notCancelled).toBe(true);
});
