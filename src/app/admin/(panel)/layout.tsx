import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { db } from "@/server/db";
import { ADMIN_NAV } from "@/components/admin/nav";
import { AdminSidebar } from "@/components/admin/sidebar";
import { staffSignOut } from "../login/actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffPage("dashboard.view");
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(actor, i.permission)) })).filter((g) => g.items.length);
  const unread = await db.notification.count({ where: { staffUserId: actor.userId, readAt: null, channel: "IN_APP" } });
  return (
    <div className="flex min-h-dvh bg-canvas">
      <a href="#main" className="skip-link">تخطي إلى المحتوى</a>
      <AdminSidebar groups={groups} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <div className="text-sm text-ink-muted">
            مرحباً، <span className="font-medium text-ink">{actor.name}</span>
            <span className="ms-2 hidden text-xs sm:inline">({actor.branchIds === "ALL" ? "كل الفروع" : `${actor.branchIds.length} فرع`})</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/" className="rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-surface-2">المتجر</Link>
            <Link href="/admin/notifications" className="relative rounded-md p-2 text-ink-muted hover:bg-surface-2" aria-label={`الإشعارات (${unread})`}>
              <Bell className="h-5 w-5" aria-hidden />
              {unread > 0 ? <span className="num absolute -top-0.5 -left-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[10px] text-white">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
            <form action={staffSignOut}>
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-surface-2">
                <LogOut className="h-4 w-4" aria-hidden />
                خروج
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
