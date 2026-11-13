import { useState, type FormEvent } from 'react';
import { Bike, Store, Zap } from 'lucide-react';
import type { Platform } from './usePlatform';

export default function Login({ platform }: { platform: Platform }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const courier = location.pathname === '/courier';
  const submit = (event: FormEvent) => { event.preventDefault(); void platform.login(email, password); };
  return <div className="login-page"><form className="card settings-form login-card" onSubmit={submit}>
    <span className="brand"><span className="brand-mark"><Zap size={25} /></span>tezkor PARTNER</span>
    <h1>{courier ? <Bike /> : <Store />} {courier ? 'Kuryer kirishi' : 'Restoran paneliga kirish'}</h1>
    <p className="muted">Hisobingiz emaili va parolini kiriting. Ma’lumotlar PostgreSQL bazasidan olinadi.</p>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Parol<input type="password" autoComplete="current-password" required maxLength={200} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {platform.error && <div className="info-note api-error" role="alert">{platform.error}</div>}
    <button className="button primary full" disabled={platform.pending || platform.loading}>{platform.pending || platform.loading ? 'Ulanmoqda…' : 'Kirish'}</button>
    <p className="muted">Demo hisoblar faqat alohida demo bazaga seed orqali yaratiladi. Parolni server administratori belgilaydi.</p>
  </form></div>;
}
