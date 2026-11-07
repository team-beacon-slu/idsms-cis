import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getMaintenanceNotice, setMaintenanceNotice } from "./maintenanceNotice";

describe("maintenance notice", () => {
  beforeEach(resetPrismaMock);

  it("reads the stored message, and null when unset or empty", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValueOnce({
      configValue: { message: "Down Sat 8 PM" },
    } as never);
    expect(await getMaintenanceNotice()).toBe("Down Sat 8 PM");
    prismaMock.systemConfig.findUnique.mockResolvedValueOnce(null);
    expect(await getMaintenanceNotice()).toBeNull();
    prismaMock.systemConfig.findUnique.mockResolvedValueOnce({
      configValue: { message: "" },
    } as never);
    expect(await getMaintenanceNotice()).toBeNull();
  });

  it("saves a trimmed message with an audit entry, and rejects a long one", async () => {
    prismaMock.systemConfig.upsert.mockResolvedValue({ id: "c1" } as never);
    expect(await setMaintenanceNotice({ message: "  Down Sat  " }, "admin")).toEqual({
      message: "Down Sat",
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MAINTENANCE_NOTICE_SET" }),
      })
    );
    await expect(setMaintenanceNotice({ message: "x".repeat(301) }, "admin")).rejects.toThrow();
  });
});
