import { requireAdmin } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";
import Footer from "@/components/Footer";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <AdminNav profile={profile} />
      <main className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
