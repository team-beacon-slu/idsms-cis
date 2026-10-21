// Seeds Philippine holidays (FR-AT-02) into `holiday_calendar` for the active
// semester. Only dates inside that semester's [startDate, endDate] are added.
// Idempotent: a holiday already present for the same semester + date is skipped.
//
//   npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed-holidays.ts            # dry run
//   npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed-holidays.ts --apply    # write
//
// Dates follow the usual Proclamation pattern for 2026–2027. Verify them against
// the official Malacañang proclamation for each year before relying on them;
// movable Islamic holidays (Eid'l Fitr / Eid'l Adha) are announced separately
// and are not included.
import "dotenv/config"; // Prisma 7 no longer loads .env itself
import { HolidayType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const HOLIDAYS: { date: string; name: string; type: HolidayType }[] = [
  // 2026
  { date: "2026-01-01", name: "New Year's Day", type: HolidayType.NATIONAL },
  { date: "2026-02-17", name: "Chinese New Year", type: HolidayType.NATIONAL },
  {
    date: "2026-02-25",
    name: "EDSA People Power Revolution Anniversary",
    type: HolidayType.NATIONAL,
  },
  { date: "2026-04-02", name: "Maundy Thursday", type: HolidayType.NATIONAL },
  { date: "2026-04-03", name: "Good Friday", type: HolidayType.NATIONAL },
  { date: "2026-04-04", name: "Black Saturday", type: HolidayType.NATIONAL },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: HolidayType.NATIONAL },
  { date: "2026-05-01", name: "Labor Day", type: HolidayType.NATIONAL },
  { date: "2026-06-12", name: "Independence Day", type: HolidayType.NATIONAL },
  { date: "2026-08-21", name: "Ninoy Aquino Day", type: HolidayType.NATIONAL },
  { date: "2026-08-31", name: "National Heroes Day", type: HolidayType.NATIONAL },
  { date: "2026-09-01", name: "Baguio City Charter Day", type: HolidayType.REGIONAL },
  { date: "2026-11-01", name: "All Saints' Day", type: HolidayType.NATIONAL },
  { date: "2026-11-02", name: "All Souls' Day", type: HolidayType.NATIONAL },
  { date: "2026-11-30", name: "Bonifacio Day", type: HolidayType.NATIONAL },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception", type: HolidayType.NATIONAL },
  { date: "2026-12-24", name: "Christmas Eve", type: HolidayType.NATIONAL },
  { date: "2026-12-25", name: "Christmas Day", type: HolidayType.NATIONAL },
  { date: "2026-12-30", name: "Rizal Day", type: HolidayType.NATIONAL },
  { date: "2026-12-31", name: "Last Day of the Year", type: HolidayType.NATIONAL },
  // 2027 (first half, for semesters that span the new year)
  { date: "2027-01-01", name: "New Year's Day", type: HolidayType.NATIONAL },
  { date: "2027-02-06", name: "Chinese New Year", type: HolidayType.NATIONAL },
  {
    date: "2027-02-25",
    name: "EDSA People Power Revolution Anniversary",
    type: HolidayType.NATIONAL,
  },
  { date: "2027-03-25", name: "Maundy Thursday", type: HolidayType.NATIONAL },
  { date: "2027-03-26", name: "Good Friday", type: HolidayType.NATIONAL },
  { date: "2027-03-27", name: "Black Saturday", type: HolidayType.NATIONAL },
  { date: "2027-04-09", name: "Araw ng Kagitingan", type: HolidayType.NATIONAL },
  { date: "2027-05-01", name: "Labor Day", type: HolidayType.NATIONAL },
  { date: "2027-06-12", name: "Independence Day", type: HolidayType.NATIONAL },
];

async function main() {
  const apply = process.argv.includes("--apply");

  try {
    const semester = await prisma.semester.findFirst({ where: { isActive: true } });
    if (!semester) {
      console.log("No active semester found — nothing to seed.");
      return;
    }
    console.log(
      `Active semester: ${semester.name} (${semester.academicYear}) ` +
        `${semester.startDate.toISOString().slice(0, 10)} → ${semester.endDate.toISOString().slice(0, 10)}`
    );

    const inRange = HOLIDAYS.filter((h) => {
      const date = new Date(`${h.date}T00:00:00Z`);
      return date >= semester.startDate && date <= semester.endDate;
    });

    let created = 0;
    for (const holiday of inRange) {
      const date = new Date(`${holiday.date}T00:00:00Z`);
      const existing = await prisma.holidayCalendarEntry.findFirst({
        where: { semesterId: semester.id, studentProfileId: null, date },
        select: { id: true },
      });
      if (existing) {
        console.log(`  skip   ${holiday.date}  ${holiday.name} (already present)`);
        continue;
      }
      console.log(`  ${apply ? "add " : "would add"}  ${holiday.date}  ${holiday.name}`);
      if (apply) {
        await prisma.holidayCalendarEntry.create({
          data: { date, name: holiday.name, holidayType: holiday.type, semesterId: semester.id },
        });
        created += 1;
      }
    }

    console.log(
      apply
        ? `Done — ${created} holiday(s) added.`
        : `Dry run — ${inRange.length} holiday(s) in range. Re-run with --apply to write.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
