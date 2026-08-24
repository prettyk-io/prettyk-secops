import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

/** Shadcn Dashboard Block 01 — Cards + Data Table + Chart */
const DASHBOARD_01 = `<div class="flex min-h-screen w-full">
  <div class="flex-1 p-6 space-y-6">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border bg-card p-6 shadow-sm">
        <div class="text-xs font-medium text-muted-foreground">Total Revenue</div>
        <div class="text-2xl font-bold mt-1">$45,231.89</div>
        <div class="text-xs text-emerald-400 mt-0.5">+20.1% from last month</div>
      </div>
      <div class="rounded-xl border bg-card p-6 shadow-sm">
        <div class="text-xs font-medium text-muted-foreground">Subscriptions</div>
        <div class="text-2xl font-bold mt-1">+2,350</div>
        <div class="text-xs text-emerald-400 mt-0.5">+180.1% from last month</div>
      </div>
      <div class="rounded-xl border bg-card p-6 shadow-sm">
        <div class="text-xs font-medium text-muted-foreground">Sales</div>
        <div class="text-2xl font-bold mt-1">+12,234</div>
        <div class="text-xs text-emerald-400 mt-0.5">+19% from last month</div>
      </div>
      <div class="rounded-xl border bg-card p-6 shadow-sm">
        <div class="text-xs font-medium text-muted-foreground">Active Now</div>
        <div class="text-2xl font-bold mt-1">+573</div>
        <div class="text-xs text-emerald-400 mt-0.5">+201 since last hour</div>
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border bg-card p-6 shadow-sm h-[350px] flex items-center justify-center text-muted-foreground text-sm">
        Chart Area · Revenue Over Time
      </div>
      <div class="rounded-xl border bg-card p-6 shadow-sm">
        <div class="text-sm font-semibold mb-4">Recent Transactions</div>
        <div class="space-y-3">
          <div class="flex items-center justify-between text-sm"><span class="text-foreground">Olivia Martin</span><span class="text-emerald-400 font-mono">+$1,999.00</span></div>
          <div class="flex items-center justify-between text-sm"><span class="text-foreground">Jackson Lee</span><span class="text-emerald-400 font-mono">+$39.00</span></div>
          <div class="flex items-center justify-between text-sm"><span class="text-foreground">Isabella Nguyen</span><span class="text-rose-400 font-mono">-$299.00</span></div>
        </div>
      </div>
    </div>
  </div>
</div>`;

/** Sidebar-03 — Collapsible sidebar with submenu */
const SIDEBAR_03 = `<div class="flex h-full">
  <div class="w-[240px] bg-card border-r flex flex-col p-4 gap-3">
    <div class="font-bold text-lg text-foreground flex items-center gap-2">
      <span class="size-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">P</span>
      PrettyK
    </div>
    <nav class="flex flex-col gap-1 mt-4">
      <a class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-accent text-accent-foreground">Dashboard</a>
      <a class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground">Findings</a>
      <div>
        <button class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground w-full text-left">
          Reports
        </button>
        <div class="ml-6 mt-1 space-y-1">
          <a class="block px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground">Allure Reports</a>
          <a class="block px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground">Dojo Exports</a>
        </div>
      </div>
      <a class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground">Settings</a>
    </nav>
  </div>
  <div class="flex-1 p-6 flex items-center justify-center text-sm text-muted-foreground">
    Main Content Area
  </div>
</div>`;

/** Login-03 — Minimal single-column */
const LOGIN_03 = `<div class="min-h-screen flex items-center justify-center bg-background p-4">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Sign In</h1>
      <p class="text-sm text-muted-foreground">Enter your credentials to continue</p>
    </div>
    <div class="space-y-4">
      <input class="w-full px-3 py-2 rounded-lg border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="admin@prettyk.io" />
      <input type="password" class="w-full px-3 py-2 rounded-lg border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="••••••••" />
      <button class="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">Sign In</button>
    </div>
  </div>
</div>`;

/** Login-04 — Branded with gradient background */
const LOGIN_04 = `<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-950 p-4">
  <div class="w-full max-w-sm space-y-8">
    <div class="flex justify-center">
      <span class="text-4xl font-bold bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent">pretty&lt;</span>
    </div>
    <div class="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 space-y-5">
      <div class="space-y-2 text-center">
        <h2 class="text-xl font-bold text-white">Welcome back</h2>
        <p class="text-sm text-slate-400">Sign in to SecOps Control</p>
      </div>
      <div class="space-y-4">
        <input class="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" placeholder="admin_sec@spaceport.cbr.ru" />
        <input type="password" class="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" placeholder="••••••••" />
        <button class="w-full py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-600 text-white font-semibold text-sm shadow-lg shadow-purple-900/30 hover:opacity-95 transition-opacity">Sign In</button>
      </div>
    </div>
  </div>
</div>`;

/** Settings page */
const SETTINGS_PAGE = `<div class="max-w-2xl mx-auto p-6 space-y-8">
  <h2 class="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
  <div class="rounded-xl border bg-card shadow-sm">
    <div class="p-6 border-b">
      <h3 class="text-sm font-semibold">Profile</h3>
      <p class="text-xs text-muted-foreground mt-1">Manage your profile settings and notifications</p>
    </div>
    <div class="p-6 space-y-4">
      <div class="space-y-2"><label class="text-sm font-medium">Display Name</label><input class="w-full px-3 py-2 rounded-lg border bg-transparent text-sm" value="Vera Petrova" /></div>
      <div class="space-y-2"><label class="text-sm font-medium">Email</label><input class="w-full px-3 py-2 rounded-lg border bg-transparent text-sm" value="vaera@prettyk.io" /></div>
      <div class="flex items-center justify-between py-1"><span class="text-sm">Email Notifications</span><div class="w-9 h-5 rounded-full bg-primary relative cursor-pointer"><div class="size-4 rounded-full bg-white absolute top-0.5 right-0.5 shadow"></div></div></div>
      <button class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">Save Changes</button>
    </div>
  </div>
</div>`;

export function DashboardBlocks() {
  const copyCode = (label: string, code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.success(`${label} HTML copied`)).catch(() => {});
  };

  return (
    <div className="p-8 space-y-8 min-h-full">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">shadcn Dashboard Block (dashboard-01)</h2>
          <Button size="sm" variant="outline" onClick={() => copyCode('Dashboard', DASHBOARD_01)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy HTML</Button>
        </div>
        <Card className="overflow-hidden border border-border/30 rounded-2xl max-h-[400px] overflow-y-auto">
          <div className="dark" dangerouslySetInnerHTML={{ __html: DASHBOARD_01 }} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Sidebar-03 (Collapsible Submenus)</h2>
            <Button size="sm" variant="outline" onClick={() => copyCode('Sidebar', SIDEBAR_03)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy</Button>
          </div>
          <Card className="overflow-hidden border border-border/30 rounded-2xl h-[240px] dark">
            <div dangerouslySetInnerHTML={{ __html: SIDEBAR_03 }} />
          </Card>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Sidebar-07 (Icon Compact)</h2>
            <Button size="sm" variant="outline" onClick={() => copyCode('Sidebar', SIDEBAR_03)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy</Button>
          </div>
          <Card className="overflow-hidden border border-border/30 rounded-2xl h-[240px] dark flex items-center justify-center text-sm text-muted-foreground">
            Sidebar-07: Icon compact sidebar (collapsed). Same HTML structure, just icons visible.
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LoginSettings() {
  const copyCode = (label: string, code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.success(`${label} HTML copied`)).catch(() => {});
  };

  return (
    <div className="p-8 space-y-8 min-h-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Login-03 (Minimal)</h2>
            <Button size="sm" variant="outline" onClick={() => copyCode('Login', LOGIN_03)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy HTML</Button>
          </div>
          <Card className="overflow-hidden border border-border/30 rounded-2xl h-[320px] dark">
            <div dangerouslySetInnerHTML={{ __html: LOGIN_03 }} />
          </Card>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Login-04 (Branded)</h2>
            <Button size="sm" variant="outline" onClick={() => copyCode('Login', LOGIN_04)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy HTML</Button>
          </div>
          <Card className="overflow-hidden border border-border/30 rounded-2xl h-[320px] dark">
            <div dangerouslySetInnerHTML={{ __html: LOGIN_04 }} />
          </Card>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Settings Page (settings-01)</h2>
          <Button size="sm" variant="outline" onClick={() => copyCode('Settings', SETTINGS_PAGE)} className="text-xs h-7"><Copy className="size-3 mr-1" /> Copy HTML</Button>
        </div>
        <Card className="overflow-hidden border border-border/30 rounded-2xl h-[360px] dark">
          <div dangerouslySetInnerHTML={{ __html: SETTINGS_PAGE }} />
        </Card>
      </div>
    </div>
  );
}