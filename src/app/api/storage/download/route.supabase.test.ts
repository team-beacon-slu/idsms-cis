/** @jest-environment node */
// With the default Supabase driver this route must serve nothing, even for a well-formed link.
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest } from "next/server";
import { GET } from "./route";

it("answers 404 when files live in Supabase Storage", async () => {
  const res = await GET(
    new NextRequest(
      "http://localhost:3000/api/storage/download?b=checklist-documents&k=a&exp=9999999999&sig=x"
    )
  );
  expect(res.status).toBe(404);
});
