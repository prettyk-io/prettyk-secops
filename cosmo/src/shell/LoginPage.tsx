import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrettyKMark } from '../components/PrettyKMark';
import { login } from './auth';
import { useLocale } from '../locales';
import { CheckCircle, Eye, EyeOff } from 'lucide-react';

export type LoginPageProps = { onSuccess: () => void };

export function LoginPage({ onSuccess }: LoginPageProps): React.JSX.Element {
  const { dict } = useLocale(); const L = dict.login;
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); const [ssoRedirecting, setSsoRedirecting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const ssoTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => { return () => { window.clearTimeout(ssoTimerRef.current); }; }, []);

  const handleSubmit = () => {
    const result = login(username, password);
    if (!result.ok) { setError(result.error); return; } setError(null); onSuccess();
  };
  const handleSso = () => { if (ssoRedirecting) return; setSsoRedirecting(true);
    window.clearTimeout(ssoTimerRef.current); ssoTimerRef.current = window.setTimeout(() => { setSsoRedirecting(false); ssoTimerRef.current = undefined; }, 3000); };

  return (
    <div className="dark h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: "#09090b" }}>
      <div className="relative z-10 w-[380px] rounded-xl p-8 space-y-5" style={{ background: "rgba(15,23,42,0.85)", border: "1px solid #1e293b", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div className="flex justify-center"><PrettyKMark variant="secops" /></div>
        <div className="space-y-3">
          <div><label className="text-xs font-medium block mb-1.5" style={{ color: "#94a3b8", fontFamily: "Golos UI, sans-serif" }}>{L.login}</label>
            <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="login-username" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} /></div>
          <div><label className="text-xs font-medium block mb-1.5" style={{ color: "#94a3b8", fontFamily: "Golos UI, sans-serif" }}>{L.password}</label>
            <div className="relative"><Input type={showPwd ? "text" : "password"} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} data-testid="login-password" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} className="pr-10" />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }}>{showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
          {error && <div className="rounded-md px-3 py-2 text-xs flex items-center gap-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>{error}</div>}
          <Button className="w-full" onClick={handleSubmit} data-testid="login-submit">{L.signIn}</Button>
          <Button variant="outline" className="w-full" data-testid="login-sso" onClick={handleSso}>{ssoRedirecting ? <><CheckCircle className="size-4" />{L.ssoRedirect}</> : L.sso}</Button>
        </div></div>
    </div>);
}