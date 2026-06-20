import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminNavigationPage() {
  return <SettingsForm focus="navigation" settings={await getThemeSettings()} />;
}

