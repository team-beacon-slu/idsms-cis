import { clearDraft, loadDraft, saveDraft } from "@/lib/utils/reportDraft";

type R = { hours: string; dirty: boolean };
const server: Record<string, R> = {
  mon: { hours: "", dirty: false },
  tue: { hours: "8", dirty: false },
};

beforeEach(() => localStorage.clear());

it("restores unsaved days after the tab is closed", () => {
  saveDraft("wr-1", { mon: { hours: "7", dirty: true }, tue: server.tue }, server, 1000);

  expect(loadDraft("wr-1", server, 2000)).toEqual({
    savedAt: 1000,
    rows: { mon: { hours: "7", dirty: true } },
  });
});

it("drops a draft day once the server's copy has changed", () => {
  saveDraft("wr-1", { mon: { hours: "7", dirty: true } }, server);
  const savedElsewhere = { ...server, mon: { hours: "6", dirty: false } };

  expect(loadDraft("wr-1", savedElsewhere)).toBeNull();
  expect(localStorage.getItem("idsms:weekly-draft:wr-1")).toBeNull();
});

it("clears the draft when nothing is dirty, and expires old drafts", () => {
  saveDraft("wr-1", { mon: { hours: "7", dirty: true } }, server, 0);
  saveDraft("wr-1", { mon: server.mon }, server);
  expect(loadDraft("wr-1", server)).toBeNull();

  saveDraft("wr-2", { mon: { hours: "7", dirty: true } }, server, 0);
  expect(loadDraft("wr-2", server, 15 * 24 * 60 * 60 * 1000)).toBeNull();
});

it("never throws when storage is unavailable or corrupt", () => {
  localStorage.setItem("idsms:weekly-draft:wr-1", "{not json");
  expect(loadDraft("wr-1", server)).toBeNull();

  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => saveDraft("wr-1", { mon: { hours: "7", dirty: true } }, server)).not.toThrow();
  spy.mockRestore();
  expect(() => clearDraft("wr-1")).not.toThrow();
});
