import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { auditLogFilterSchema, queryAuditLogs } from "@/lib/services/auditLogQuery";

beforeEach(() => {
  resetPrismaMock();
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.auditLog.count.mockResolvedValue(0);
});

const parse = (input: Record<string, unknown>) => auditLogFilterSchema.parse(input);

describe("auditLogFilterSchema", () => {
  it("defaults to page 1 and rejects an invalid date or page", () => {
    expect(parse({}).page).toBe(1);
    expect(auditLogFilterSchema.safeParse({ from: "notadate" }).success).toBe(false);
    expect(auditLogFilterSchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("queryAuditLogs", () => {
  it("builds the where clause from every filter, newest first, with Manila day bounds", async () => {
    await queryAuditLogs(
      parse({
        action: "LOGIN_SUCCESS",
        entityType: "User",
        email: "ana",
        from: "2026-10-01",
        to: "2026-10-11",
        page: "3",
      })
    );

    const args = prismaMock.auditLog.findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      where: {
        action: "LOGIN_SUCCESS",
        entityType: "User",
        user: { email: { contains: "ana", mode: "insensitive" } },
        timestamp: {
          gte: new Date("2026-09-30T16:00:00.000Z"),
          lt: new Date("2026-10-11T16:00:00.000Z"),
        },
      },
      orderBy: { timestamp: "desc" },
      skip: 100,
      take: 50,
    });
    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where: args!.where });
  });

  it("applies no filters when none are given", async () => {
    await queryAuditLogs(parse({}));

    expect(prismaMock.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: {},
      skip: 0,
      take: 50,
    });
  });

  it("caps rows at max for exports and still reports the full total", async () => {
    prismaMock.auditLog.count.mockResolvedValue(12_345);

    const result = await queryAuditLogs(parse({}), { max: 10_000 });

    expect(prismaMock.auditLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 10_000 });
    expect(result.total).toBe(12_345);
  });

  it("flattens the user email onto each row", async () => {
    const timestamp = new Date("2026-10-11T01:00:00.000Z");
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        timestamp,
        action: "X",
        entityType: "User",
        entityId: null,
        ipAddress: "1.2.3.4",
        detail: { a: 1 },
        user: { email: "ana@slu.edu.ph" },
      },
      {
        id: "a2",
        timestamp,
        action: "Y",
        entityType: "User",
        entityId: null,
        ipAddress: null,
        detail: null,
        user: null,
      },
    ] as never);

    const { rows } = await queryAuditLogs(parse({}));

    expect(rows.map((r) => r.email)).toEqual(["ana@slu.edu.ph", null]);
    expect(rows[0]).toEqual({
      id: "a1",
      timestamp,
      action: "X",
      entityType: "User",
      entityId: null,
      email: "ana@slu.edu.ph",
      ipAddress: "1.2.3.4",
      detail: { a: 1 },
    });
  });
});
