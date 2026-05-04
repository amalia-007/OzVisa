import { getLocale } from "next-intl/server";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const locale = await getLocale();
  return <AdminClient locale={locale} />;
}
