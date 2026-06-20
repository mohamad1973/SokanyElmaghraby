import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminFooterPage() {
  return <SettingsForm focus="footer" settings={await getThemeSettings()} />;
}

