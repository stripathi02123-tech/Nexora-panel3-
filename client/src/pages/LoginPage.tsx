import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, HardDrive, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import toast from 'react-hot-toast';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, verify2FA } = useAuth();
  const { appName, primaryColor, backgroundImageUrl } = useTheme();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeUserId, setChallengeUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(() => !!localStorage.getItem('nexora_remember_email'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    emailRef.current?.focus();
    const saved = localStorage.getItem('nexora_remember_email');
    if (remember && saved) setEmail(saved);
  }, [remember]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Invalid email format';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requires2FA) {
        setChallengeUserId(result.challengeUserId || null);
        setTwoFactorCode('');
        setShow2FA(true);
        return;
      }

      if (remember) localStorage.setItem('nexora_remember_email', email);
      else localStorage.removeItem('nexora_remember_email');
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      setLoginError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeUserId || !/^\d{6}$/.test(twoFactorCode)) {
      setLoginError('Enter the 6-digit authentication code');
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      await verify2FA(challengeUserId, twoFactorCode);
      if (remember) localStorage.setItem('nexora_remember_email', email);
      else localStorage.removeItem('nexora_remember_email');
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = (pw: string): { label: string; color: string; width: string } => {
    if (!pw) return { label: '', color: '', width: '0%' };
    if (pw.length < 6) return { label: 'Weak', color: 'bg-red-500', width: '25%' };
    if (pw.length < 10) return { label: 'Fair', color: 'bg-orange-500', width: '50%' };
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pw)) return { label: 'Strong', color: 'bg-green-500', width: '100%' };
    return { label: 'Good', color: 'bg-yellow-500', width: '75%' };
  };
  const strength = passwordStrength(password);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {backgroundImageUrl ? (
        <>
          <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
          <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/80" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" />
      )}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-20 dark:opacity-10 blur-3xl" style={{ backgroundColor: primaryColor, transform: 'translate(-30%, -30%)' }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-20 dark:opacity-10 blur-3xl" style={{ backgroundColor: primaryColor, transform: 'translate(30%, 30%)' }} />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 shadow-lg animate-neon-pulse" style={{ backgroundColor: primaryColor }}>
            <HardDrive className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to your <span style={{ color: primaryColor }} className="font-medium">{appName}</span>
          </p>
        </div>

        <div className="backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 rounded-2xl shadow-xl p-8 relative" style={{ border: `1px solid rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.2)` }}>
          {loginError && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {loginError}
            </div>
          )}

          {!show2FA ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-field">Email</label>
                <input ref={emailRef} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }} className={`input-field ${errors.email ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="you@example.com" autoComplete="email" />
                {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email}</p>}
              </div>

              <div>
                <label className="label-field">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }} className={`input-field pr-10 ${errors.password ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="Enter your password" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1.5">{errors.password}</p>}
                {password && !errors.password && (
                  <div className="mt-2">
                    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{strength.label}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: primaryColor }}>Forgot password?</Link>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-11" style={!loading ? { backgroundColor: primaryColor } : undefined}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-5">
              <div>
                <label className="label-field">Two-Factor Authentication Code</label>
                <input type="text" inputMode="numeric" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input-field text-center text-lg tracking-widest" placeholder="000000" maxLength={6} autoFocus autoComplete="one-time-code" />
              </div>
              <button type="submit" disabled={loading || twoFactorCode.length !== 6} className="btn-primary w-full flex items-center justify-center gap-2 h-11" style={!loading ? { backgroundColor: primaryColor } : undefined}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : 'Verify'}
              </button>
              <button type="button" onClick={() => { setShow2FA(false); setChallengeUserId(null); setTwoFactorCode(''); setLoginError(''); }} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center gap-3 mt-8">
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
          <p className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: primaryColor }}>Create one</Link>
          </p>
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
