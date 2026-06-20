import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminBannersPage() {
  return <SettingsForm focus="banners" settings={await getThemeSettings()} />;
}

