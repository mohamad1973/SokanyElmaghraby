import { getThemeSettings } from "@/lib/theme-settings";

import { ReviewsSettingsForm } from "./reviews-settings-form";

export default async function AdminReviewsPage() {
  return <ReviewsSettingsForm initialSettings={await getThemeSettings()} />;
}
