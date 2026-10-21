/** @jest-environment node */
// createClient is mocked at the module boundary — storage.ts calls it at
// import time (top-level singleton, mirroring src/lib/prisma.ts), so real
// Supabase credentials must never be required just to import this module in
// tests. The mock fns are declared *inside* the factory (not hoisted consts
// referenced from it) because Jest hoists jest.mock() above the imports that
// trigger it, which would otherwise read them before initialization.
jest.mock("@supabase/supabase-js", () => {
  const mockUpload = jest.fn();
  const mockCreateSignedUrl = jest.fn();
  const mockRemove = jest.fn();
  const mockFrom = jest.fn(() => ({
    upload: mockUpload,
    createSignedUrl: mockCreateSignedUrl,
    remove: mockRemove,
  }));
  return { createClient: jest.fn(() => ({ storage: { from: mockFrom } })) };
});

import { createClient } from "@supabase/supabase-js";
import {
  CHECKLIST_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  InvalidFileError,
  StorageDeleteError,
  deleteObject,
  getSignedUrl,
  uploadFile,
  uploadPdfBuffer,
  validateUpload,
} from "@/lib/storage";

// storage.ts already called createClient() once at import time (its
// module-level singleton) — reuse that same call's mocks rather than
// creating a second, disconnected set.
const mockedCreateClient = createClient as jest.Mock;
const supabaseInstance = mockedCreateClient.mock.results[0].value;
const mockFrom = supabaseInstance.storage.from as jest.Mock;
const { upload: mockUpload, createSignedUrl: mockCreateSignedUrl, remove: mockRemove } = mockFrom();

const MAGIC: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

// Real leading bytes for the type, so uploadFile's content check passes.
function makeFile(sizeBytes: number, type: string) {
  const bytes = new Uint8Array(sizeBytes);
  bytes.set((MAGIC[type] ?? []).slice(0, sizeBytes));
  return new File([bytes], "file", { type });
}

beforeEach(() => {
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockRemove.mockReset();
  mockFrom.mockClear();
});

describe("deleteObject", () => {
  it("removes the given path from the given bucket", async () => {
    mockRemove.mockResolvedValue({ data: [], error: null });

    await expect(
      deleteObject(GENERATED_DOCUMENTS_BUCKET, "weekly/p1/wr1.pdf")
    ).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith(GENERATED_DOCUMENTS_BUCKET);
    expect(mockRemove).toHaveBeenCalledWith(["weekly/p1/wr1.pdf"]);
  });

  it("is idempotent: a 'not found' error resolves", async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    await expect(deleteObject(CHECKLIST_BUCKET, "gone.pdf")).resolves.toBeUndefined();
  });

  it("throws StorageDeleteError for any other failure", async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    const err = await deleteObject(CHECKLIST_BUCKET, "x.pdf").catch((e) => e);
    expect(err).toBeInstanceOf(StorageDeleteError);
    expect(err.message).toBe("permission denied");
  });
});

describe("validateUpload", () => {
  it("accepts a PDF under the 5MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "application/pdf"))).not.toThrow();
  });

  it("accepts a JPEG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/jpeg"))).not.toThrow();
  });

  it("accepts a PNG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/png"))).not.toThrow();
  });

  it("rejects an unsupported mime type", () => {
    expect(() => validateUpload(makeFile(1024, "application/zip"))).toThrow(InvalidFileError);
  });

  it("names 'unknown' in the error when the file carries no mime type at all", () => {
    expect(() => validateUpload(makeFile(1024, ""))).toThrow(/unknown/);
  });

  it("rejects a PDF over the 5MB cap", () => {
    expect(() => validateUpload(makeFile(5 * 1024 * 1024 + 1, "application/pdf"))).toThrow(
      InvalidFileError
    );
  });

  it("rejects an image over the 2MB cap, using the smaller image limit not the PDF limit", () => {
    expect(() => validateUpload(makeFile(2 * 1024 * 1024 + 1, "image/png"))).toThrow(/2MB limit/);
  });
});

describe("uploadFile", () => {
  it("validates before ever touching Storage", async () => {
    await expect(
      uploadFile(CHECKLIST_BUCKET, "path.zip", makeFile(10, "application/zip"))
    ).rejects.toThrow(InvalidFileError);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes don't match its declared type", async () => {
    const renamed = new File([new TextEncoder().encode("<html>hi</html>")], "x.pdf", {
      type: "application/pdf",
    });
    await expect(uploadFile(CHECKLIST_BUCKET, "p/x.pdf", renamed)).rejects.toThrow(
      /don't match its type/
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uploads with upsert:true and the file's content type, returning the path", async () => {
    mockUpload.mockResolvedValue({ data: { path: "profile-1/x.pdf" }, error: null });

    const result = await uploadFile(
      CHECKLIST_BUCKET,
      "profile-1/x.pdf",
      makeFile(10, "application/pdf")
    );

    expect(result).toBe("profile-1/x.pdf");
    expect(mockFrom).toHaveBeenCalledWith(CHECKLIST_BUCKET);
    expect(mockUpload).toHaveBeenCalledWith(
      "profile-1/x.pdf",
      expect.anything(),
      expect.objectContaining({ upsert: true, contentType: "application/pdf" })
    );
  });

  it("wraps a Storage error as InvalidFileError", async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: "bucket not found" } });

    await expect(
      uploadFile(CHECKLIST_BUCKET, "profile-1/x.pdf", makeFile(10, "application/pdf"))
    ).rejects.toThrow(/bucket not found/);
  });
});

describe("getSignedUrl", () => {
  it("returns the signed URL on success", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });

    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");

    expect(url).toBe("https://signed.example/x");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("profile-1/x.pdf", 300);
  });

  it("respects a custom expiry", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });

    await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf", 60);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith("profile-1/x.pdf", 60);
  });

  it("throws InvalidFileError when Storage returns an error", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } });

    await expect(getSignedUrl(CHECKLIST_BUCKET, "missing.pdf")).rejects.toThrow(/not found/);
  });

  it("throws InvalidFileError when Storage returns no data and no error", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: null });

    await expect(getSignedUrl(CHECKLIST_BUCKET, "missing.pdf")).rejects.toThrow(InvalidFileError);
  });
});

describe("uploadPdfBuffer", () => {
  it("uploads a PDF buffer with upsert and the PDF content type", async () => {
    mockUpload.mockResolvedValue({ error: null });
    const pdf = Buffer.from("%PDF-1.4 test");

    const path = await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "weekly/p1/wr1.pdf", pdf);

    expect(path).toBe("weekly/p1/wr1.pdf");
    expect(mockFrom).toHaveBeenCalledWith("generated-documents");
    expect(mockUpload).toHaveBeenCalledWith("weekly/p1/wr1.pdf", pdf, {
      upsert: true,
      contentType: "application/pdf",
    });
  });

  it("rejects a buffer over the 5MB PDF cap without calling Storage", async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", tooBig)).rejects.toThrow(
      InvalidFileError
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("surfaces a Storage error as InvalidFileError", async () => {
    mockUpload.mockResolvedValue({ error: { message: "bucket not found" } });
    await expect(
      uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", Buffer.from("%PDF"))
    ).rejects.toThrow("bucket not found");
  });
});
