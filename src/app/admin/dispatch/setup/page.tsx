import { ShippingSetupPanel } from "./setup-panel";

export const dynamic = "force-dynamic";

export default function ShippingSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إعداد الشحن</h1>
        <p className="mt-2 text-sm text-zinc-600">فحص قاعدة البيانات وBosta وتهيئة أحياء التوصيل الافتراضية.</p>
      </div>
      <ShippingSetupPanel />
    </div>
  );
}
