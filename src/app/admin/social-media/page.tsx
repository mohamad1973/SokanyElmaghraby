import { getThemeSettings } from "@/lib/theme-settings";

import { SettingsForm } from "../settings-form";

export default async function AdminSocialMediaPage() {
  return <SettingsForm focus="socialMedia" settings={await getThemeSettings()} />;
}
