import Link from "next/link";

const cards = [
  {
    title: "المظهر",
    description: "تحكم في الألوان، الفونتات، اللوجو، والهوية العامة.",
    href: "/admin/theme",
  },
  {
    title: "الهيدر والموبايل",
    description: "إدارة الهيدر، بنر أعلى الموقع، وإعدادات الموبايل.",
    href: "/admin/header",
  },
  {
    title: "الطلبات",
    description: "عرض طلبات ووكومرس بنفس طريقة لوحة ووردبريس.",
    href: "/admin/orders",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-950">لوحة التحكم</h1>
        <p className="mt-2 text-sm text-zinc-600">
          إدارة واجهة المتجر ومتابعة طلبات ووكومرس من مكان واحد.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="text-xl font-bold text-zinc-950">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600">{card.description}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-950">مصادر البيانات الحالية</h2>
        <ol className="mt-4 list-decimal space-y-2 pr-5 text-sm leading-7 text-zinc-700">
          <li>المنتجات والطلبات تأتي من ووكومرس.</li>
          <li>منيو الهيدر تأتي من تصنيفات ووكومرس بدون أي إضافة ووردبريس.</li>
          <li>إعدادات الشكل يتم حفظها في قاعدة البيانات الخاصة بالمشروع.</li>
        </ol>
      </div>
    </div>
  );
}

