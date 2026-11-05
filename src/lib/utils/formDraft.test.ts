import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { clearFormDraft, loadFormDraft, saveFormDraft, useFormDraft } from "@/lib/utils/formDraft";

// The real hook: restore on mount must not wipe the stored draft before it is shown.
function useJournal() {
  const [value, setValue] = useState({ narrative: "", office: "IT" });
  const dirty = useFormDraft("hook", value, server, (draft) => setValue(draft));
  return { value, setValue, dirty };
}

describe("useFormDraft", () => {
  beforeEach(() => localStorage.clear());

  it("offers back a stored draft and keeps it stored", () => {
    saveFormDraft(
      "hook",
      { narrative: "typed before the timeout", office: "IT" },
      server,
      Date.now()
    );
    const { result } = renderHook(() => useJournal());
    expect(result.current.value.narrative).toBe("typed before the timeout");
    expect(result.current.dirty).toBe(true);
    expect(loadFormDraft("hook", server)?.value.narrative).toBe("typed before the timeout");
  });

  it("stores new typing and forgets it once it matches the server again", () => {
    const { result } = renderHook(() => useJournal());
    act(() => result.current.setValue({ narrative: "new", office: "IT" }));
    expect(loadFormDraft("hook", server)?.value.narrative).toBe("new");
    act(() => result.current.setValue(server));
    expect(loadFormDraft("hook", server)).toBeNull();
  });
});

const server = { narrative: "", office: "IT" };

beforeEach(() => localStorage.clear());

describe("formDraft", () => {
  it("restores typed text while the server copy is unchanged", () => {
    saveFormDraft("jle", { narrative: "typed", office: "IT" }, server, 1000);
    expect(loadFormDraft("jle", server, 2000)).toEqual({
      savedAt: 1000,
      value: { narrative: "typed", office: "IT" },
    });
  });

  it("stores nothing when the form matches the server", () => {
    saveFormDraft("jle", { narrative: "typed", office: "IT" }, server, 1000);
    saveFormDraft("jle", server, server, 1500);
    expect(loadFormDraft("jle", server, 2000)).toBeNull();
  });

  it("drops the draft when the server copy changed since", () => {
    saveFormDraft("jle", { narrative: "typed", office: "IT" }, server, 1000);
    expect(loadFormDraft("jle", { narrative: "saved elsewhere", office: "IT" }, 2000)).toBeNull();
    expect(loadFormDraft("jle", server, 2000)).toBeNull();
  });

  it("drops drafts older than two weeks", () => {
    saveFormDraft("jle", { narrative: "typed", office: "IT" }, server, 0);
    expect(loadFormDraft("jle", server, 15 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("clears on demand", () => {
    saveFormDraft("jle", { narrative: "typed", office: "IT" }, server, 1000);
    clearFormDraft("jle");
    expect(loadFormDraft("jle", server, 2000)).toBeNull();
  });
});
