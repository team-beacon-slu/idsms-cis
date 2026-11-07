import { NO_DUTY_PREFIX, kindForDate, toBody } from "./request-form";

const base = {
  deviationType: "NO_DUTY",
  requestKind: "ANTICIPATED",
  date: "2026-11-02",
  endDate: "2026-11-06",
  startTime: "",
  endTime: "",
  reason: "The office is closed for inventory.",
  proofType: "",
};

it("files no duty as an excused absence over the date range, with the company's notice", () => {
  expect(toBody(base)).toEqual({
    deviationType: "ABSENCE",
    requestKind: "ANTICIPATED",
    date: "2026-11-02",
    endDate: "2026-11-06",
    startTime: undefined,
    endTime: undefined,
    reason: `${NO_DUTY_PREFIX}The office is closed for inventory.`,
    proofType: "WRITTEN_NOTICE",
  });
});

it("doesn't prefix twice, and leaves an ordinary leave alone", () => {
  expect(toBody({ ...base, reason: `${NO_DUTY_PREFIX}x` }).reason).toBe(`${NO_DUTY_PREFIX}x`);
  const leave = toBody({ ...base, deviationType: "ABSENCE", proofType: "MEDICAL_CERTIFICATE" });
  expect(leave.reason).toBe("The office is closed for inventory.");
  expect(leave.proofType).toBe("MEDICAL_CERTIFICATE");
});

it("files a request for today or the past as an emergency, on the Manila calendar", () => {
  const now = new Date("2026-11-05T17:00:00Z"); // 01:00 on 6 Nov in Manila
  expect(kindForDate("2026-11-06", now)).toBe("EMERGENCY");
  expect(kindForDate("2026-11-01", now)).toBe("EMERGENCY");
  expect(kindForDate("2026-11-07", now)).toBe("ANTICIPATED");
  expect(kindForDate("", now)).toBe("ANTICIPATED");
});
