import { nameParts, sluFileName } from "@/lib/documents/slu";

describe("SLU file names (OJT Documentation Guidelines)", () => {
  it("splits 'Last, First M.' and drops middle initials and spaces", () => {
    expect(nameParts("Dela Cruz, Juan Miguel P.")).toEqual({
      last: "DelaCruz",
      first: "JuanMiguel",
    });
    expect(nameParts("Santos, Ana")).toEqual({ last: "Santos", first: "Ana" });
    expect(nameParts("Ana M Santos")).toEqual({ last: "Santos", first: "Ana" });
    expect(nameParts("Peña, José")).toEqual({ last: "Pena", first: "Jose" });
  });

  it("names each document the way SLU asks", () => {
    const name = "Dela Cruz, Juan P.";
    expect(sluFileName({ kind: "WWR", week: 1 }, name)).toBe("WWR01 DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "WWR", week: 12 }, name)).toBe("WWR12 DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "JLE", month: "2027-01" }, name)).toBe("JLEJan DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "TECHNICAL_REPORT" }, name)).toBe("DelaCruz_OJTTechnicalReport.pdf");
    expect(sluFileName({ kind: "OT", week: 3 }, name)).toBe("WWR03 OffDutyHours DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "UT" }, name)).toBe("UnderTimeHours DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "ABSENCE" }, name)).toBe("AbsenceReport DelaCruzJuan.pdf");
    expect(sluFileName({ kind: "HTE_EVALUATION" }, name)).toBe("FM-VAA-052 DelaCruzJuan.pdf");
  });
});
