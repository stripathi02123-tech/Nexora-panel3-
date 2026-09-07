import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import api from '@/utils/api';
import toast from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';

const ForgotPasswordPage: React.FC = () => {
  const { appName, primaryColor } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      toast.success('If the account exists, a reset link has been sent.');
    } catch {
      // The API intentionally returns a generic response to prevent account enumeration.
      setSent(true);
      toast.success('If the account exists, a reset link has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Forgot Password</h1>
            <p className="text-sm text-gray-500">Reset your {appName} password</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-400">
              Check your email for a password reset link. The link expires in 1 hour.
            </div>
            <Link to="/login" className="btn-secondary w-full flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label-field">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2" style={{ backgroundColor: primaryColor }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send reset link'}
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

export default ForgotPasswordPage;
