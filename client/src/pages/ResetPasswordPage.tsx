import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import api from '@/utils/api';
import toast from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { appName, primaryColor } = useTheme();
  const email = params.get('email') || '';
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const valid = useMemo(
    () => !!email && !!token && password.length >= 8 && password === confirmPassword,
    [email, token, password, confirmPassword],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !token) {
      setError('This password reset link is invalid or incomplete.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, token, password });
      setDone(true);
      toast.success('Password reset successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Reset Password</h1>
            <p className="text-sm text-gray-500">Set a new {appName} password</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex gap-3 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>Your password has been reset successfully.</span>
            </div>
            <button type="button" onClick={() => navigate('/login')} className="btn-primary w-full" style={{ backgroundColor: primaryColor }}>
              Continue to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!email || !token ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
                This reset link is invalid or incomplete. Request a new link from the login page.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            ) : null}

            <div>
              <label className="label-field">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label-field">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading || !valid} className="btn-primary w-full flex items-center justify-center gap-2" style={{ backgroundColor: primaryColor }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</> : 'Reset password'}
            </button>

            <Link to="/login" className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
