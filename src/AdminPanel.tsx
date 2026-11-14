import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import type { Platform } from './usePlatform';

interface Account { id: number; name: string; email: string; role: 'EMPLOYEE' | 'COURIER'; active: boolean }
export default function AdminPanel({ platform, openRestaurant }: { platform: Platform; openRestaurant: () => void }) {
  const [selected, setSelected] = useState(platform.state.restaurantId ?? platform.restaurants[0]?.id);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [accountVersion, setAccountVersion] = useState(0);
  useEffect(() => { if (!selected && platform.restaurants.length) setSelected(platform.restaurants[0].id); }, [selected, platform.restaurants]);
  useEffect(() => {
    if (!selected) { setAccounts([]); return; }
    let active = true; setError(''); setAccounts([]);
    void api<Account[]>(`/restaurants/${selected}/accounts`).then(data => { if (active) setAccounts(data); }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [selected, accountVersion]);
  async function createRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const saved = await platform.mutate('/restaurants', 'POST', { name: String(data.get('name')).trim(), phone: String(data.get('phone')).trim(), address: String(data.get('address')).trim() });
    if (saved) { form.reset(); setMessage('Restoran yaratildi.'); }
  }
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = event.currentTarget; const data = new FormData(form);
    const kind = data.get('kind') === 'COURIER' ? 'couriers' : 'employees';
    const saved = await platform.mutate(`/restaurants/${selected}/${kind}`, 'POST', { name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), password: String(data.get('password')) });
    // Clear temporary staff password after every attempt, including failures.
    const password = form.elements.namedItem('password') as HTMLInputElement; password.value = '';
    if (saved) { form.reset(); setAccountVersion(v => v + 1); setMessage('Hisob yaratildi.'); }
  }
  async function toggleAccount(account: Account) {
    if (await platform.mutate(`/restaurants/${selected}/accounts/${account.id}`, 'PATCH', { active: !account.active })) setAccountVersion(v => v + 1);
  }
  return <div className="admin-workspace"><header className="topbar"><b>Tezkor Partner · SUPER ADMIN</b><div className="top-actions"><span>{platform.user?.name}</span><button className="button secondary" disabled={platform.pending} onClick={() => void platform.logout()}>Chiqish</button></div></header>
    <main aria-busy={platform.pending}><div className="page-heading"><div><h1>Platforma boshqaruvi</h1><p>Restoranlar, xodimlar va kuryerlar</p></div><button className="button secondary" disabled={platform.pending} onClick={() => { setAccountVersion(v => v + 1); void platform.refresh(); }}>Yangilash</button></div>
      {(platform.error || error) && <div className="info-note api-error" role="alert">{platform.error || error}</div>}
      {message && <div className="info-note" role="status">{message}</div>}
      {platform.pending && <p role="status">Saqlanmoqda…</p>}
      <div className="two-columns"><section className="card form-card"><h2>Restoranlar</h2>{!platform.restaurants.length && <p>Hozircha restoran yo‘q. Birinchi restoraningizni yarating.</p>}
        {platform.restaurants.map(restaurant => <div className="transaction" key={restaurant.id}><button className="text-button" onClick={() => setSelected(restaurant.id)}>{restaurant.name}</button><button className="button secondary" disabled={platform.pending} onClick={async () => { if (await platform.selectRestaurant(restaurant.id)) openRestaurant(); }}>Restoran paneli</button></div>)}
        <form className="settings-form" onSubmit={createRestaurant}><h2>Yangi restoran</h2><label>Restoran nomi<input name="name" required maxLength={80} /></label><label>Telefon<input name="phone" required maxLength={25} /></label><label>Manzil<input name="address" required maxLength={300} /></label><button disabled={platform.pending} className="button primary">Restoran yaratish</button></form>
      </section><section className="card form-card"><h2>Xodim va kuryer hisoblari</h2>
        <label className="select-control">Restoranni tanlash<select value={selected ?? ''} disabled={platform.pending} onChange={e => setSelected(Number(e.target.value))}><option value="" disabled>Restoranni tanlang</option>{platform.restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {selected ? <><form className="settings-form" onSubmit={createAccount}><label>Hisob turi<select name="kind"><option value="EMPLOYEE">Restoran xodimi</option><option value="COURIER">Kuryer</option></select></label><label>Ism<input name="name" required maxLength={80} /></label><label>Email<input name="email" type="email" autoComplete="off" required maxLength={254} /></label><label>Boshlang‘ich parol<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} /></label><button className="button primary" disabled={platform.pending}>Hisob yaratish</button></form>
          {accounts.map(account => <div className="transaction" key={account.id}><div><b>{account.name}</b><small>{account.email} · {account.role === 'COURIER' ? 'Kuryer' : 'Xodim'} · {account.active ? 'Faol' : 'Nofaol'}</small></div><button className="button secondary" disabled={platform.pending} onClick={() => void toggleAccount(account)}>{account.active ? 'To‘xtatish' : 'Faollashtirish'}</button></div>)}</> : <p>Avval restoran yarating yoki tanlang.</p>}
      </section></div></main></div>;
}
