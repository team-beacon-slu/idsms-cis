import { NO_DUTY_PREFIX, toBody } from "./request-form";

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
