import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminThemePage() {
  return <SettingsForm focus="theme" settings={await getThemeSettings()} />;
}

