"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Access = {
  isAdmin: boolean;
  isManager: boolean;
  canCenters: boolean;
  canJobs: boolean;
  canEmployees: boolean;
  canPermissions: boolean;
  canOpen: boolean;
};

type CatalogItem = { id: string; label: string; later: boolean };

type Center = {
  id: number;
  name: string;
  address: string;
  governorate: string;
  phones: string[];
  headcount: number;
  staffCount: number;
};

type Job = {
  id: number;
  title: string;
  parentId: number | null;
  sortOrder: number;
  responsibilities: string;
  permissions: string[];
};

type Employee = {
  id: number;
  centerId: number;
  jobId: number | null;
  name: string;
  phone: string;
  address: string;
  photoUrl: string;
  username: string;
  centerName: string;
  jobTitle: string;
};

type Tab = "centers" | "jobs" | "permissions" | "employees";

const FIELD =
  "h-10 w-full rounded-xl border border-[#E5E5E5] bg-[#F5F5F0] px-3 text-sm font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

function emptyCenter(): Omit<Center, "id" | "staffCount"> {
  return { name: "", address: "", governorate: "", phones: [""], headcount: 0 };
}

function emptyJob(): Omit<Job, "id"> {
  return { title: "", parentId: null, sortOrder: 0, responsibilities: "", permissions: [] };
}

function emptyEmployee(): {
  name: string;
  phone: string;
  address: string;
  photoUrl: string;
  centerId: number | "";
  jobId: number | "";
  username: string;
  password: string;
} {
  return { name: "", phone: "", address: "", photoUrl: "", centerId: "", jobId: "", username: "", password: "" };
}

function JobBranch({
  jobs,
  parentId,
  depth,
  selectedId,
  onSelect,
}: {
  jobs: Job[];
  parentId: number | null;
  depth: number;
  selectedId: number | null;
  onSelect: (job: Job) => void;
}) {
  const kids = jobs.filter((job) => job.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  if (!kids.length) return null;
  return (
    <ul className={depth ? "mr-4 border-r-2 border-[#FCA311]/70 pr-3" : "space-y-1"}>
      {kids.map((job) => (
        <li key={job.id} className="mt-1">
          <button
            type="button"
            onClick={() => onSelect(job)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-sm font-extrabold ${
              selectedId === job.id ? "bg-[#14213D] text-white" : "bg-[#F5F5F0] text-[#14213D]"
            }`}
          >
            <span>{job.title}</span>
            <span className="text-[10px] font-bold opacity-70">مستوى {depth + 1}</span>
          </button>
          <JobBranch jobs={jobs} parentId={job.id} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

export function ScCentersClient() {
  const [tab, setTab] = useState<Tab>("centers");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [governorates, setGovernorates] = useState<string[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [centerForm, setCenterForm] = useState(emptyCenter());
  const [editingCenter, setEditingCenter] = useState<number | null>(null);
  const [jobForm, setJobForm] = useState(emptyJob());
  const [editingJob, setEditingJob] = useState<number | null>(null);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee());
  const [editingEmployee, setEditingEmployee] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/cs/centers");
    const data = (await res.json()) as {
      message?: string;
      access?: Access;
      catalog?: CatalogItem[];
      governorates?: string[];
      centers?: Center[];
      jobs?: Job[];
      employees?: Employee[];
    };
    if (!res.ok) {
      setMessage(data.message || "تعذر التحميل.");
      return;
    }
    setAccess(data.access || null);
    setCatalog(data.catalog || []);
    setGovernorates(data.governorates || []);
    setCenters(data.centers || []);
    setJobs(data.jobs || []);
    setEmployees(data.employees || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!access) return;
    const allowed: Tab[] = [];
    if (access.canCenters) allowed.push("centers");
    if (access.canJobs) allowed.push("jobs");
    if (access.canPermissions || access.canJobs) allowed.push("permissions");
    if (access.canEmployees) allowed.push("employees");
    if (allowed.length && !allowed.includes(tab)) setTab(allowed[0]);
  }, [access, tab]);

  const parentOptions = useMemo(() => {
    if (!editingJob) return jobs;
    const blocked = new Set<number>([editingJob]);
    const stack = [editingJob];
    while (stack.length) {
      const id = stack.pop()!;
      for (const job of jobs) {
        if (job.parentId === id && !blocked.has(job.id)) {
          blocked.add(job.id);
          stack.push(job.id);
        }
      }
    }
    return jobs.filter((job) => !blocked.has(job.id));
  }, [jobs, editingJob]);

  const canManageAnything = Boolean(access?.canCenters || access?.canJobs || access?.canEmployees || access?.canPermissions);

  async function post(body: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/centers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return false;
    }
    await load();
    return true;
  }

  async function remove(resource: string, id: number) {
    if (!window.confirm("تأكيد الحذف؟")) return;
    setLoading(true);
    setMessage("");
    const res = await fetch(`/api/cs/centers?resource=${resource}&id=${id}`, { method: "DELETE" });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحذف.");
      return;
    }
    await load();
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("purpose", "sc-employee-photo");
    const res = await fetch("/api/cs/upload", { method: "POST", body: form });
    const data = (await res.json()) as { url?: string; message?: string };
    setUploading(false);
    if (!res.ok || !data.url) {
      setMessage(data.message || "تعذر رفع الصورة.");
      return;
    }
    setEmployeeForm((prev) => ({ ...prev, photoUrl: data.url || "" }));
  }

  async function toggleJobPermission(job: Job, permissionId: string) {
    if (!access?.canPermissions && !access?.canJobs) return;
    if (catalog.find((item) => item.id === permissionId)?.later) return;
    const permissions = job.permissions.includes(permissionId)
      ? job.permissions.filter((id) => id !== permissionId)
      : [...job.permissions, permissionId];
    await post({
      resource: "job",
      id: job.id,
      title: job.title,
      parentId: job.parentId,
      sortOrder: job.sortOrder,
      responsibilities: job.responsibilities,
      permissions,
    });
  }

  if (access && !canManageAnything) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow ring-1 ring-[#14213D]/10" dir="rtl">
        <h1 className="text-xl font-extrabold text-[#14213D]">مراكز الصيانة</h1>
        <p className="mt-3 text-sm font-bold text-[#14213D]/70">وظيفتك لسه ما عليهاش شاشات إدارة. لو الاستقبال متاح لوظيفتك افتح تاب الاستقبال.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">مراكز الصيانة</h1>
        <p className="text-sm font-bold text-[#14213D]/70">المراكز والوظائف الهرمية والموظفين. صلاحية الموظف من المسمى الوظيفي.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["centers", "المراكز", access?.canCenters],
            ["jobs", "الوظائف", access?.canJobs],
            ["permissions", "الصلاحيات", access?.canPermissions || access?.canJobs],
            ["employees", "الموظفين", access?.canEmployees],
          ] as const
        )
          .filter((item) => item[2])
          .map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl px-3 py-2 text-xs font-extrabold sm:text-sm ${
                tab === id ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
              }`}
            >
              {label}
            </button>
          ))}
      </div>
      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}

      {tab === "centers" && access?.canCenters ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await post({
                resource: "center",
                id: editingCenter || undefined,
                ...centerForm,
                phones: centerForm.phones.filter(Boolean),
              });
              if (ok) {
                setCenterForm(emptyCenter());
                setEditingCenter(null);
                setMessage(editingCenter ? "تم تعديل المركز." : "تم إنشاء المركز.");
              }
            }}
          >
            <h2 className="font-extrabold text-[#14213D]">{editingCenter ? "تعديل مركز" : "مركز جديد"}</h2>
            <input className={FIELD} placeholder="اسم المركز" value={centerForm.name} onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })} />
            <textarea className={`${FIELD} h-20 py-2`} placeholder="العنوان" value={centerForm.address} onChange={(e) => setCenterForm({ ...centerForm, address: e.target.value })} />
            <select className={FIELD} value={centerForm.governorate} onChange={(e) => setCenterForm({ ...centerForm, governorate: e.target.value })}>
              <option value="">المحافظة</option>
              {governorates.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {centerForm.phones.map((phone, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className={FIELD}
                  placeholder={`تليفون ${index + 1}`}
                  value={phone}
                  onChange={(e) => {
                    const phones = [...centerForm.phones];
                    phones[index] = e.target.value;
                    setCenterForm({ ...centerForm, phones });
                  }}
                />
                {centerForm.phones.length > 1 ? (
                  <button type="button" className="h-10 rounded-xl bg-[#E5E5E5] px-3 text-xs font-extrabold" onClick={() => setCenterForm({ ...centerForm, phones: centerForm.phones.filter((_, i) => i !== index) })}>
                    x
                  </button>
                ) : null}
              </div>
            ))}
            <button type="button" className="text-xs font-extrabold text-[#14213D]" onClick={() => setCenterForm({ ...centerForm, phones: [...centerForm.phones, ""] })}>
              + رقم تليفون
            </button>
            <input
              className={FIELD}
              type="number"
              min={0}
              placeholder="عدد الموظفين"
              value={centerForm.headcount}
              onChange={(e) => setCenterForm({ ...centerForm, headcount: Number(e.target.value) || 0 })}
            />
            <div className="flex gap-2">
              <button disabled={loading} className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60">
                {loading ? "جاري الحفظ" : editingCenter ? "حفظ التعديل" : "إنشاء المركز"}
              </button>
              {editingCenter ? (
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#E5E5E5] px-4 text-sm font-extrabold"
                  onClick={() => {
                    setEditingCenter(null);
                    setCenterForm(emptyCenter());
                  }}
                >
                  إلغاء
                </button>
              ) : null}
            </div>
          </form>
          <div className="space-y-2">
            {centers.map((center) => (
              <div key={center.id} className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                <p className="font-extrabold text-[#14213D]">{center.name}</p>
                <p className="text-xs font-bold text-[#14213D]/70">
                  {center.governorate} · {center.address || "بدون عنوان"}
                </p>
                <p className="text-xs font-bold text-[#14213D]/70" dir="ltr">
                  {center.phones.join(" · ") || "بدون تليفون"}
                </p>
                <p className="mt-1 text-xs font-extrabold text-[#14213D]">
                  العدد المدخل {center.headcount} · الفعلي {center.staffCount}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-[#14213D] px-3 py-1 text-xs font-extrabold text-white"
                    onClick={() => {
                      setEditingCenter(center.id);
                      setCenterForm({
                        name: center.name,
                        address: center.address,
                        governorate: center.governorate,
                        phones: center.phones.length ? center.phones : [""],
                        headcount: center.headcount,
                      });
                    }}
                  >
                    تعديل
                  </button>
                  <button type="button" className="rounded-lg bg-red-700 px-3 py-1 text-xs font-extrabold text-white" onClick={() => void remove("center", center.id)}>
                    حذف
                  </button>
                </div>
              </div>
            ))}
            {!centers.length ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70">مفيش مراكز بعد.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === "jobs" && access?.canJobs ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <h2 className="mb-2 font-extrabold text-[#14213D]">الهرم الوظيفي</h2>
            <JobBranch jobs={jobs} parentId={null} depth={0} selectedId={editingJob} onSelect={(job) => {
              setEditingJob(job.id);
              setJobForm({
                title: job.title,
                parentId: job.parentId,
                sortOrder: job.sortOrder,
                responsibilities: job.responsibilities,
                permissions: job.permissions,
              });
            }} />
            {!jobs.length ? <p className="text-sm font-bold text-[#14213D]/70">أضف أول مسمى في قمة الهرم.</p> : null}
          </div>
          <form
            className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await post({
                resource: "job",
                id: editingJob || undefined,
                ...jobForm,
                parentId: jobForm.parentId || null,
              });
              if (ok) {
                setJobForm(emptyJob());
                setEditingJob(null);
                setMessage(editingJob ? "تم تعديل الوظيفة." : "تم إنشاء الوظيفة.");
              }
            }}
          >
            <h2 className="font-extrabold text-[#14213D]">{editingJob ? "تعديل وظيفة" : "مسمى وظيفي جديد"}</h2>
            <input className={FIELD} placeholder="المسمى الوظيفي" value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} />
            <select
              className={FIELD}
              value={jobForm.parentId || ""}
              onChange={(e) => setJobForm({ ...jobForm, parentId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">قمة الهرم (بدون أب)</option>
              {parentOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  يتبع: {job.title}
                </option>
              ))}
            </select>
            <input
              className={FIELD}
              type="number"
              placeholder="ترتيب العرض"
              value={jobForm.sortOrder}
              onChange={(e) => setJobForm({ ...jobForm, sortOrder: Number(e.target.value) || 0 })}
            />
            <textarea
              className={`${FIELD} h-24 py-2`}
              placeholder="مسؤوليات الوظيفة"
              value={jobForm.responsibilities}
              onChange={(e) => setJobForm({ ...jobForm, responsibilities: e.target.value })}
            />
            <div className="space-y-1">
              {catalog.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#FCA311]"
                    checked={jobForm.permissions.includes(item.id)}
                    disabled={item.later}
                    onChange={() =>
                      setJobForm({
                        ...jobForm,
                        permissions: jobForm.permissions.includes(item.id)
                          ? jobForm.permissions.filter((id) => id !== item.id)
                          : [...jobForm.permissions, item.id],
                      })
                    }
                  />
                  {item.label}
                  {item.later ? <span className="text-[#14213D]/50">لاحقًا</span> : null}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button disabled={loading} className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60">
                {loading ? "جاري الحفظ" : editingJob ? "حفظ التعديل" : "إنشاء الوظيفة"}
              </button>
              {editingJob ? (
                <>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-[#E5E5E5] px-4 text-sm font-extrabold"
                    onClick={() => {
                      setEditingJob(null);
                      setJobForm(emptyJob());
                    }}
                  >
                    وظيفة جديدة
                  </button>
                  <button type="button" className="h-10 rounded-xl bg-red-700 px-4 text-sm font-extrabold text-white" onClick={() => void remove("job", editingJob)}>
                    حذف
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {tab === "permissions" && (access?.canPermissions || access?.canJobs) ? (
        <div className="overflow-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[#E5E5E5] text-right">
                <th className="px-3 py-2">الوظيفة</th>
                {catalog.map((item) => (
                  <th key={item.id} className="px-2 py-2 text-xs">
                    {item.label}
                    {item.later ? <div className="font-bold text-[#14213D]/50">لاحقًا</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-[#14213D]/10">
                  <td className="px-3 py-2 font-extrabold">{job.title}</td>
                  {catalog.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#FCA311]"
                        checked={job.permissions.includes(item.id)}
                        disabled={item.later || loading}
                        onChange={() => void toggleJobPermission(job, item.id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.length ? <p className="p-4 text-sm font-bold text-[#14213D]/70">أضف وظائف أولاً من تبويب الوظائف.</p> : null}
        </div>
      ) : null}

      {tab === "employees" && access?.canEmployees ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await post({
                resource: "employee",
                id: editingEmployee || undefined,
                ...employeeForm,
                centerId: employeeForm.centerId || undefined,
                jobId: employeeForm.jobId || null,
              });
              if (ok) {
                setEmployeeForm(emptyEmployee());
                setEditingEmployee(null);
                setMessage(editingEmployee ? "تم تعديل الموظف." : "تم إنشاء الموظف.");
              }
            }}
          >
            <h2 className="font-extrabold text-[#14213D]">{editingEmployee ? "تعديل موظف" : "موظف جديد"}</h2>
            <input className={FIELD} placeholder="اسم الموظف" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} />
            <input className={FIELD} placeholder="رقم الموبايل" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} />
            <textarea className={`${FIELD} h-16 py-2`} placeholder="العنوان" value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} />
            <select className={FIELD} value={employeeForm.centerId} onChange={(e) => setEmployeeForm({ ...employeeForm, centerId: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">مركز الصيانة</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
            <select className={FIELD} value={employeeForm.jobId} onChange={(e) => setEmployeeForm({ ...employeeForm, jobId: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">المسمى الوظيفي</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
            <label className="block text-xs font-bold text-[#14213D]">
              صورة شخصية
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-xs"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
            </label>
            {employeeForm.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={employeeForm.photoUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
            ) : null}
            {uploading ? <p className="text-xs font-bold">جاري رفع الصورة...</p> : null}
            {editingEmployee ? null : (
              <input className={FIELD} placeholder="يوزرنيم الدخول" value={employeeForm.username} onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })} />
            )}
            <input
              className={FIELD}
              type="password"
              placeholder={editingEmployee ? "باسورد جديد (اختياري)" : "باسورد الدخول"}
              value={employeeForm.password}
              onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
            />
            <div className="flex gap-2">
              <button disabled={loading} className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60">
                {loading ? "جاري الحفظ" : editingEmployee ? "حفظ التعديل" : "إنشاء الموظف"}
              </button>
              {editingEmployee ? (
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#E5E5E5] px-4 text-sm font-extrabold"
                  onClick={() => {
                    setEditingEmployee(null);
                    setEmployeeForm(emptyEmployee());
                  }}
                >
                  إلغاء
                </button>
              ) : null}
            </div>
          </form>
          <div className="space-y-2">
            {employees.map((row) => (
              <div key={row.id} className="flex gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#E5E5E5] text-xs font-extrabold">بدون</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[#14213D]">{row.name}</p>
                  <p className="text-xs font-bold text-[#14213D]/70">
                    {row.centerName || "بدون مركز"} · {row.jobTitle || "بدون وظيفة"}
                  </p>
                  <p className="text-xs font-bold" dir="ltr">
                    {row.phone || "بدون موبايل"} · {row.username}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-[#14213D] px-3 py-1 text-xs font-extrabold text-white"
                      onClick={() => {
                        setEditingEmployee(row.id);
                        setEmployeeForm({
                          name: row.name,
                          phone: row.phone,
                          address: row.address,
                          photoUrl: row.photoUrl,
                          centerId: row.centerId,
                          jobId: row.jobId || "",
                          username: row.username,
                          password: "",
                        });
                      }}
                    >
                      تعديل
                    </button>
                    <button type="button" className="rounded-lg bg-red-700 px-3 py-1 text-xs font-extrabold text-white" onClick={() => void remove("employee", row.id)}>
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!employees.length ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70">مفيش موظفين بعد.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
