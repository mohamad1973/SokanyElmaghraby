import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminHeaderPage() {
  return <SettingsForm focus="header" settings={await getThemeSettings()} />;
}

