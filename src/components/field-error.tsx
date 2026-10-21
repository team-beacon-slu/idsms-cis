// An inline error under a form field. Give the field aria-invalid and
// aria-describedby={`${name}-error`} so screen readers announce this message with it.
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

// The props a field needs to point at its FieldError.
export function errorProps(name: string, message?: string) {
  return message ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};
}
