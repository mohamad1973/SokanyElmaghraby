import "server-only";

import { createCsAgent, ensureCsTables, getCsAgentById, type CsRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getPrismaClient } from "@/lib/db";
import { hashPassword } from "@/lib/security";

export const SC_GOVERNORATES = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "القليوبية",
  "المنوفية",
  "الغربية",
  "كفر الشيخ",
  "الدقهلية",
  "دمياط",
  "الشرقية",
  "بورسعيد",
  "الإسماعيلية",
  "السويس",
  "شمال سيناء",
  "جنوب سيناء",
  "البحر الأحمر",
  "الفيوم",
  "بني سويف",
  "المنيا",
  "أسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "أسوان",
  "الوادي الجديد",
  "مطروح",
  "البحيرة",
] as const;

export const SC_PERMISSION_CATALOG = [
  { id: "centers.manage", label: "إدارة المراكز", later: false },
  { id: "jobs.manage", label: "إدارة الوظائف", later: false },
  { id: "employees.manage", label: "إدارة الموظفين", later: false },
  { id: "permissions.manage", label: "مصفوفة الصلاحيات", later: false },
  { id: "returns.inspect", label: "استقبال وتسجيل العميل", later: false },
  { id: "returns.tech", label: "تقييم فني وعرض الإصلاح", later: false },
  { id: "returns.receive", label: "استلام المنتج للإصلاح", later: false },
  { id: "returns.refund", label: "طلب استرجاع / استبدال", later: false },
] as const;

export type ScPermissionId = (typeof SC_PERMISSION_CATALOG)[number]["id"];

const MANAGE_KEYS = ["centers.manage", "jobs.manage", "employees.manage", "permissions.manage"] as const;
const INTAKE_KEYS = ["returns.inspect", "returns.tech", "returns.receive", "returns.refund"] as const;

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return text
      .split(/[,،\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function encodeList(values: string[]) {
  return JSON.stringify([...new Set(values.map((item) => item.trim()).filter(Boolean))]);
}

function cleanPermissions(values: unknown): ScPermissionId[] {
  const allowed = new Set(SC_PERMISSION_CATALOG.map((row) => row.id));
  return parseJsonList(values).filter((id): id is ScPermissionId => allowed.has(id as ScPermissionId));
}

let ensurePromise: Promise<void> | null = null;

export async function ensureScCenterTables() {
  if (!ensurePromise) {
    ensurePromise = createScCenterTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

async function createScCenterTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScCenter\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`address\` TEXT NOT NULL,
      \`governorate\` VARCHAR(64) NOT NULL DEFAULT '',
      \`phones\` TEXT NOT NULL,
      \`headcount\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScJob\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`title\` VARCHAR(191) NOT NULL,
      \`parentId\` INT NULL,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`responsibilities\` TEXT NOT NULL,
      \`permissions\` TEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`ScJob_parentId_idx\`(\`parentId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScEmployee\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`centerId\` INT NOT NULL,
      \`jobId\` INT NULL,
      \`agentId\` INT NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`phone\` VARCHAR(32) NULL,
      \`address\` TEXT NOT NULL,
      \`photoUrl\` VARCHAR(255) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ScEmployee_agentId_key\`(\`agentId\`),
      INDEX \`ScEmployee_centerId_idx\`(\`centerId\`),
      INDEX \`ScEmployee_jobId_idx\`(\`jobId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScCustomer\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`phone\` VARCHAR(32) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`address\` TEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ScCustomer_phone_key\`(\`phone\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScTicket\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`customerId\` INT NOT NULL,
      \`centerId\` INT NOT NULL,
      \`agentId\` INT NOT NULL,
      \`techAgentId\` INT NULL,
      \`wooProductId\` INT NULL,
      \`productName\` VARCHAR(191) NOT NULL DEFAULT '',
      \`productCode\` VARCHAR(64) NOT NULL DEFAULT '',
      \`purchaseSource\` VARCHAR(32) NOT NULL DEFAULT '',
      \`purchaseSourceNote\` TEXT NOT NULL,
      \`purchaseDate\` DATE NULL,
      \`usageKind\` VARCHAR(16) NOT NULL DEFAULT '',
      \`visualKind\` VARCHAR(16) NOT NULL DEFAULT '',
      \`powerCut\` BOOLEAN NOT NULL DEFAULT false,
      \`defects\` TEXT NOT NULL,
      \`defectOther\` TEXT NOT NULL,
      \`techSpecs\` TEXT NOT NULL,
      \`inWarranty\` BOOLEAN NULL,
      \`partAvailable\` BOOLEAN NULL,
      \`chargeType\` VARCHAR(32) NULL,
      \`cost\` INT NULL,
      \`durationText\` VARCHAR(191) NOT NULL DEFAULT '',
      \`techNotes\` TEXT NOT NULL,
      \`refundKind\` VARCHAR(16) NULL,
      \`refundReason\` TEXT NOT NULL,
      \`hqDecision\` VARCHAR(16) NULL,
      \`hqNote\` TEXT NOT NULL,
      \`hqDecidedAt\` DATETIME(3) NULL,
      \`complaintNote\` TEXT NULL,
      \`customerRequest\` TEXT NULL,
      \`staffProposal\` TEXT NULL,
      \`managementNote\` TEXT NULL,
      \`confirmationId\` INT NULL,
      \`wooOrderNumber\` VARCHAR(64) NOT NULL DEFAULT '',
      \`fulfillmentConfirmationId\` INT NULL,
      \`waybillCarrier\` VARCHAR(64) NOT NULL DEFAULT '',
      \`waybillTracking\` VARCHAR(191) NOT NULL DEFAULT '',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'intake',
      \`quotedAt\` DATETIME(3) NULL,
      \`acceptedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`ScTicket_customerId_idx\`(\`customerId\`),
      INDEX \`ScTicket_centerId_idx\`(\`centerId\`),
      INDEX \`ScTicket_status_idx\`(\`status\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  for (const sql of [
    "ALTER TABLE `ScTicket` ADD COLUMN `complaintNote` TEXT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `customerRequest` TEXT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `staffProposal` TEXT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `managementNote` TEXT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `confirmationId` INT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `wooOrderNumber` VARCHAR(64) NOT NULL DEFAULT ''",
    "ALTER TABLE `ScTicket` ADD COLUMN `fulfillmentConfirmationId` INT NULL",
    "ALTER TABLE `ScTicket` ADD COLUMN `waybillCarrier` VARCHAR(64) NOT NULL DEFAULT ''",
    "ALTER TABLE `ScTicket` ADD COLUMN `waybillTracking` VARCHAR(191) NOT NULL DEFAULT ''",
  ]) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Duplicate column|already exists|1060/i.test(message)) {
        console.warn("[sc] ticket column:", message.slice(0, 200));
      }
    }
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScTicketPhoto\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`ticketId\` INT NOT NULL,
      \`kind\` VARCHAR(16) NOT NULL,
      \`url\` VARCHAR(255) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`ScTicketPhoto_ticketId_idx\`(\`ticketId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ScTicketEvent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`ticketId\` INT NOT NULL,
      \`kind\` VARCHAR(32) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`agentId\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`ScTicketEvent_ticketId_idx\`(\`ticketId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export type ScAccess = {
  isAdmin: boolean;
  isManager: boolean;
  canCenters: boolean;
  canJobs: boolean;
  canEmployees: boolean;
  canPermissions: boolean;
  canInspect: boolean;
  canTech: boolean;
  canReceive: boolean;
  canRefund: boolean;
  canDesk: boolean;
  canOpen: boolean;
  centerId: number | null;
  centerName: string;
};

export async function resolveScAccess(agentId: number): Promise<ScAccess> {
  await ensureCsTables();
  await ensureScCenterTables();
  const viewer = await resolveCsViewer(agentId);
  const manager = Boolean(viewer.isAdmin || viewer.isScManager);
  let keys = new Set<string>();
  let centerId: number | null = null;
  let centerName = "";
  const prisma = getPrismaClient();
  if (prisma) {
    const emp = await prisma.$queryRawUnsafe<Array<{ centerId: number; centerName: string | null; permissions: string | null }>>(
      `SELECT e.centerId, c.name AS centerName, j.permissions
       FROM ScEmployee e
       LEFT JOIN ScCenter c ON c.id = e.centerId
       LEFT JOIN ScJob j ON j.id = e.jobId
       WHERE e.agentId = ? LIMIT 1`,
      agentId,
    );
    if (emp[0]) {
      centerId = Number(emp[0].centerId) || null;
      centerName = emp[0].centerName || "";
      if (!manager) keys = new Set(cleanPermissions(emp[0].permissions));
    }
  }
  if (manager) {
    for (const key of MANAGE_KEYS) keys.add(key);
    for (const key of INTAKE_KEYS) keys.add(key);
  }
  const canInspect = keys.has("returns.inspect");
  const canTech = keys.has("returns.tech");
  const canReceive = keys.has("returns.receive");
  const canRefund = keys.has("returns.refund");
  return {
    isAdmin: Boolean(viewer.isAdmin),
    isManager: manager,
    canCenters: keys.has("centers.manage"),
    canJobs: keys.has("jobs.manage"),
    canEmployees: keys.has("employees.manage"),
    canPermissions: keys.has("permissions.manage"),
    canInspect,
    canTech,
    canReceive,
    canRefund,
    canDesk: canInspect || canTech || canReceive || canRefund,
    canOpen: manager || viewer.isScStaff || Boolean(viewer.canAccessScCenters),
    centerId,
    centerName,
  };
}

export type ScCenterRow = {
  id: number;
  name: string;
  address: string;
  governorate: string;
  phones: string[];
  headcount: number;
  staffCount: number;
};

export type ScJobRow = {
  id: number;
  title: string;
  parentId: number | null;
  sortOrder: number;
  responsibilities: string;
  permissions: ScPermissionId[];
};

export type ScEmployeeRow = {
  id: number;
  centerId: number;
  jobId: number | null;
  agentId: number;
  name: string;
  phone: string;
  address: string;
  photoUrl: string;
  username: string;
  centerName: string;
  jobTitle: string;
};

export async function loadScOrg() {
  const prisma = getPrismaClient();
  if (!prisma) return { centers: [] as ScCenterRow[], jobs: [] as ScJobRow[], employees: [] as ScEmployeeRow[] };
  await ensureScCenterTables();
  const [centers, jobs, employees] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{ id: number; name: string; address: string; governorate: string; phones: string; headcount: number; staffCount: number | bigint }>
    >(
      `SELECT c.id, c.name, c.address, c.governorate, c.phones, c.headcount,
              (SELECT COUNT(*) FROM ScEmployee e WHERE e.centerId = c.id) AS staffCount
       FROM ScCenter c ORDER BY c.name ASC`,
    ),
    prisma.$queryRawUnsafe<
      Array<{ id: number; title: string; parentId: number | null; sortOrder: number; responsibilities: string; permissions: string }>
    >(`SELECT id, title, parentId, sortOrder, responsibilities, permissions FROM ScJob ORDER BY sortOrder ASC, id ASC`),
    prisma.$queryRawUnsafe<
      Array<{
        id: number;
        centerId: number;
        jobId: number | null;
        agentId: number;
        name: string;
        phone: string | null;
        address: string;
        photoUrl: string | null;
        username: string | null;
        email: string | null;
        centerName: string | null;
        jobTitle: string | null;
      }>
    >(
      `SELECT e.id, e.centerId, e.jobId, e.agentId, e.name, e.phone, e.address, e.photoUrl,
              a.username, a.email, c.name AS centerName, j.title AS jobTitle
       FROM ScEmployee e
       LEFT JOIN CsAgent a ON a.id = e.agentId
       LEFT JOIN ScCenter c ON c.id = e.centerId
       LEFT JOIN ScJob j ON j.id = e.jobId
       ORDER BY e.name ASC`,
    ),
  ]);
  return {
    centers: centers.map((row) => ({
      id: Number(row.id),
      name: row.name,
      address: row.address || "",
      governorate: row.governorate || "",
      phones: parseJsonList(row.phones),
      headcount: Number(row.headcount) || 0,
      staffCount: Number(row.staffCount) || 0,
    })),
    jobs: jobs.map((row) => ({
      id: Number(row.id),
      title: row.title,
      parentId: row.parentId == null ? null : Number(row.parentId),
      sortOrder: Number(row.sortOrder) || 0,
      responsibilities: row.responsibilities || "",
      permissions: cleanPermissions(row.permissions),
    })),
    employees: employees.map((row) => ({
      id: Number(row.id),
      centerId: Number(row.centerId),
      jobId: row.jobId == null ? null : Number(row.jobId),
      agentId: Number(row.agentId),
      name: row.name,
      phone: row.phone || "",
      address: row.address || "",
      photoUrl: row.photoUrl || "",
      username: String(row.username || row.email?.split("@")[0] || ""),
      centerName: row.centerName || "",
      jobTitle: row.jobTitle || "",
    })),
  };
}

export async function saveScCenter(input: {
  id?: number;
  name: string;
  address: string;
  governorate: string;
  phones: string[];
  headcount: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false as const, message: "اسم المركز قصير." };
  const governorate = SC_GOVERNORATES.includes(input.governorate as (typeof SC_GOVERNORATES)[number])
    ? input.governorate
    : input.governorate.trim();
  if (!governorate) return { ok: false as const, message: "اختار المحافظة." };
  const phones = encodeList(input.phones);
  const headcount = Number.isFinite(input.headcount) ? Math.max(0, Math.floor(input.headcount)) : 0;
  const address = input.address.trim();
  if (input.id) {
    await prisma.$executeRawUnsafe(
      `UPDATE ScCenter SET name = ?, address = ?, governorate = ?, phones = ?, headcount = ?, updatedAt = NOW(3) WHERE id = ?`,
      name,
      address,
      governorate,
      phones,
      headcount,
      input.id,
    );
    return { ok: true as const, id: input.id };
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ScCenter (name, address, governorate, phones, headcount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    name,
    address,
    governorate,
    phones,
    headcount,
  );
  return { ok: true as const };
}

export async function deleteScCenter(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const used = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM ScEmployee WHERE centerId = ?`, id);
  if (Number(used[0]?.n || 0) > 0) {
    return { ok: false as const, message: "المركز عليه موظفين. انقلهم أو احذفهم أولاً." };
  }
  await prisma.$executeRawUnsafe(`DELETE FROM ScCenter WHERE id = ?`, id);
  return { ok: true as const };
}

async function jobDescendantIds(jobId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return new Set<number>();
  const jobs = await prisma.$queryRawUnsafe<Array<{ id: number; parentId: number | null }>>(`SELECT id, parentId FROM ScJob`);
  const byParent = new Map<number, number[]>();
  for (const row of jobs) {
    const parent = Number(row.parentId || 0);
    const list = byParent.get(parent) || [];
    list.push(Number(row.id));
    byParent.set(parent, list);
  }
  const out = new Set<number>();
  const stack = [...(byParent.get(jobId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of byParent.get(id) || []) stack.push(child);
  }
  return out;
}

export async function saveScJob(input: {
  id?: number;
  title: string;
  parentId: number | null;
  sortOrder: number;
  responsibilities: string;
  permissions: string[];
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const title = input.title.trim();
  if (title.length < 2) return { ok: false as const, message: "المسمى الوظيفي قصير." };
  let parentId = input.parentId && Number.isInteger(input.parentId) ? input.parentId : null;
  if (parentId) {
    const parent = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM ScJob WHERE id = ? LIMIT 1`, parentId);
    if (!parent[0]) parentId = null;
  }
  if (input.id && parentId === input.id) return { ok: false as const, message: "الوظيفة متقدرش تبقى أب لنفسها." };
  if (input.id && parentId) {
    const kids = await jobDescendantIds(input.id);
    if (kids.has(parentId)) return { ok: false as const, message: "متقدرش تخلي الابن أب للوظيفة." };
  }
  const permissions = encodeList(cleanPermissions(input.permissions));
  const responsibilities = input.responsibilities.trim();
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.floor(input.sortOrder) : 0;
  if (input.id) {
    await prisma.$executeRawUnsafe(
      `UPDATE ScJob SET title = ?, parentId = ?, sortOrder = ?, responsibilities = ?, permissions = ?, updatedAt = NOW(3) WHERE id = ?`,
      title,
      parentId,
      sortOrder,
      responsibilities,
      permissions,
      input.id,
    );
    return { ok: true as const, id: input.id };
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ScJob (title, parentId, sortOrder, responsibilities, permissions, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    title,
    parentId,
    sortOrder,
    responsibilities,
    permissions,
  );
  return { ok: true as const };
}

export async function deleteScJob(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  await prisma.$executeRawUnsafe(`UPDATE ScJob SET parentId = NULL WHERE parentId = ?`, id);
  await prisma.$executeRawUnsafe(`UPDATE ScEmployee SET jobId = NULL WHERE jobId = ?`, id);
  await prisma.$executeRawUnsafe(`DELETE FROM ScJob WHERE id = ?`, id);
  return { ok: true as const };
}

export async function saveScEmployee(input: {
  id?: number;
  centerId: number;
  jobId: number | null;
  name: string;
  phone: string;
  address: string;
  photoUrl: string;
  username?: string;
  password?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false as const, message: "اسم الموظف قصير." };
  const center = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM ScCenter WHERE id = ? LIMIT 1`, input.centerId);
  if (!center[0]) return { ok: false as const, message: "اختار مركز الصيانة." };
  let jobId = input.jobId && Number.isInteger(input.jobId) ? input.jobId : null;
  if (jobId) {
    const job = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM ScJob WHERE id = ? LIMIT 1`, jobId);
    if (!job[0]) jobId = null;
  }
  const phone = input.phone.replace(/\D/g, "");
  const address = input.address.trim();
  const photoUrl = input.photoUrl.trim().slice(0, 255);

  if (input.id) {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: number; agentId: number }>>(
      `SELECT id, agentId FROM ScEmployee WHERE id = ? LIMIT 1`,
      input.id,
    );
    if (!existing[0]) return { ok: false as const, message: "الموظف غير موجود." };
    await prisma.$executeRawUnsafe(
      `UPDATE ScEmployee SET centerId = ?, jobId = ?, name = ?, phone = ?, address = ?, photoUrl = ?, updatedAt = NOW(3) WHERE id = ?`,
      input.centerId,
      jobId,
      name,
      phone || null,
      address,
      photoUrl || null,
      input.id,
    );
    await prisma.$executeRawUnsafe(`UPDATE CsAgent SET name = ?, phone = ?, updatedAt = NOW(3) WHERE id = ?`, name, phone || null, existing[0].agentId);
    if (input.password && input.password.length >= 6) {
      const passwordHash = await hashPassword(input.password);
      await prisma.$executeRawUnsafe(`UPDATE CsAgent SET passwordHash = ?, updatedAt = NOW(3) WHERE id = ?`, passwordHash, existing[0].agentId);
    }
    return { ok: true as const, id: input.id };
  }

  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (password.length < 6) return { ok: false as const, message: "الباسورد 6 حروف على الأقل." };
  const created = await createCsAgent({
    name,
    username,
    password,
    roles: ["sc_staff"] as CsRole[],
    phone: phone || null,
  });
  if (!created.ok) return created;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ScEmployee (centerId, jobId, agentId, name, phone, address, photoUrl, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      input.centerId,
      jobId,
      created.agent.id,
      name,
      phone || null,
      address,
      photoUrl || null,
    );
  } catch (error) {
    try {
      await prisma.csAgent.delete({ where: { id: created.agent.id } });
    } catch {
      // keep the login account rather than fail silently after a partial insert
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false as const, message: /Duplicate|1062/i.test(message) ? "الحساب مربوط بموظف تاني." : "تعذر حفظ الموظف." };
  }
  return { ok: true as const };
}

export async function deleteScEmployee(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureScCenterTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; agentId: number }>>(`SELECT id, agentId FROM ScEmployee WHERE id = ? LIMIT 1`, id);
  if (!rows[0]) return { ok: false as const, message: "الموظف غير موجود." };
  await prisma.$executeRawUnsafe(`DELETE FROM ScEmployee WHERE id = ?`, id);
  const agent = await getCsAgentById(rows[0].agentId);
  const roles = (agent as { roles?: CsRole[] } | null)?.roles || [];
  if (agent && roles.includes("sc_staff") && !roles.includes("admin")) {
    try {
      await prisma.csAgent.delete({ where: { id: rows[0].agentId } });
    } catch {
      await prisma.$executeRawUnsafe(`UPDATE CsAgent SET isActive = 0, updatedAt = NOW(3) WHERE id = ?`, rows[0].agentId);
    }
  }
  return { ok: true as const };
}
