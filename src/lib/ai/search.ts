import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedText } from "@/lib/services/ai/aiService";
import { connectionFor, runJob } from "@/lib/ai/jobs";

const MIN_SCORE = 0.5;
const LIMIT = 15;

export interface SearchHit {
  entryId: string;
  weeklyReportId: string;
  studentProfileId: string;
  intern: string;
  date: string;
  text: string;
  score: number;
}

// Job 6: "Who worked on networking?" returns the actual entries, ranked by meaning, and
// only from interns the person may see: an adviser's own class groups; the department
// for coordinators and admins. Null = semantic search isn't available to this person.
export async function searchEntries(
  user: { id: string; role: Role; aiAssist?: boolean },
  query: string
): Promise<SearchHit[] | null> {
  const conn = await connectionFor("search", user);
  if (!conn) return null;
  const q = query.trim().slice(0, 200);
  if (!q) return [];

  let scope = Prisma.sql`sp.deleted_at IS NULL`;
  if (user.role === Role.FACULTY_ADVISER) {
    const pairs = await prisma.facultyClassGroup.findMany({
      where: { facultyId: user.id, semester: { archivedAt: null } },
      select: { classGroupId: true, semesterId: true },
    });
    if (!pairs.length) return [];
    scope = Prisma.sql`sp.deleted_at IS NULL AND (${Prisma.join(
      pairs.map(
        (p) =>
          Prisma.sql`(sp.class_group_id = ${p.classGroupId}::uuid AND sp.semester_id = ${p.semesterId}::uuid)`
      ),
      " OR "
    )})`;
  } else if (user.role !== Role.DEPARTMENT_COORDINATOR && user.role !== Role.SUPER_ADMIN) {
    return null;
  }

  const vector = await runJob("search", () => embedText(conn, q));
  const rows = await prisma.$queryRaw<
    {
      entry_id: string;
      weekly_report_id: string;
      student_profile_id: string;
      intern: string | null;
      student_number: string;
      report_date: Date;
      accomplishments: string;
      score: number;
    }[]
  >`
    SELECT e.id AS entry_id, w.id AS weekly_report_id, sp.id AS student_profile_id,
           sp.full_name AS intern, sp.student_number, e.report_date, e.accomplishments,
           (1 - (e.embedding_vector <=> ${`[${vector.join(",")}]`}::vector))::float8 AS score
    FROM daily_report_entries e
    JOIN weekly_reports w ON w.id = e.weekly_report_id
    JOIN student_profiles sp ON sp.id = w.student_profile_id
    WHERE e.embedding_vector IS NOT NULL AND ${scope}
    ORDER BY e.embedding_vector <=> ${`[${vector.join(",")}]`}::vector
    LIMIT ${LIMIT}`;
  return rows
    .filter((r) => Number(r.score) >= MIN_SCORE)
    .map((r) => ({
      entryId: r.entry_id,
      weeklyReportId: r.weekly_report_id,
      studentProfileId: r.student_profile_id,
      intern: r.intern ?? r.student_number,
      date: new Date(r.report_date).toISOString().slice(0, 10),
      text: r.accomplishments,
      score: Math.round(Number(r.score) * 100) / 100,
    }));
}
