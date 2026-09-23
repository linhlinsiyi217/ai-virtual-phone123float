import type { Metadata } from "next";

import { SettingsPreviewApp } from "@/components/settings-preview/settings-preview-app";

export const metadata: Metadata = {
  title: "设置预览",
  robots: { index: false, follow: false },
};

export default function SettingsPreviewPage() {
  return <SettingsPreviewApp />;
}