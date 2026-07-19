import { getCategoriesWithMenuSelection } from "@/lib/category-menu-selection";
import { getWordPressCategoryTree } from "@/lib/menu";

import { WordpressMenuBuilder } from "./wordpress-menu-builder";

export default async function AdminNavigationPage() {
  const { flatCategories, status } = await getCategoriesWithMenuSelection(await getWordPressCategoryTree());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d2327]">القوائم</h1>
        <p className="mt-2 text-sm leading-7 text-[#646970]">
          أدر قائمة تصنيفات المتجر بنفس أسلوب ووردبريس: اختر التصنيفات من اليسار ثم رتّبها في هيكل القائمة.
        </p>
      </div>

      <WordpressMenuBuilder
        flatCategories={flatCategories}
        disabled={!status.settingsAvailable}
        statusError={status.settingsAvailable ? undefined : status.error}
      />
    </div>
  );
}
