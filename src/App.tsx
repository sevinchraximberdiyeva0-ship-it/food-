import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bell, Bike, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, Clock3, CreditCard, Download, Headphones, LayoutDashboard, MapPin, Menu, MessageSquare, Package, Plus, Search, Settings, ShoppingBag, Sparkles, Star, Store, Tag, TrendingUp, Users, UtensilsCrossed, Wallet, X, Zap } from 'lucide-react';
import type { AppState, Order, Page } from './types';
import { advanceOrder, assignCourier } from './domain/orders.mjs';
import { usePlatform, type Platform } from './usePlatform';
import Login from './Login';
import AdminPanel from './AdminPanel';

const money = (value: number) => new Intl.NumberFormat('uz-UZ').format(value);
const navigation = [
  { id: 'dashboard', name: 'Umumiy ko‘rinish', icon: LayoutDashboard },
  { id: 'orders', name: 'Buyurtmalar', icon: ShoppingBag },
  { id: 'menu', name: 'Menyu', icon: UtensilsCrossed },
  { id: 'hours', name: 'Ish vaqti', icon: Clock3 },
  { id: 'promotions', name: 'Aksiyalar', icon: Tag },
  { id: 'finance', name: 'Moliya', icon: Wallet },
  { id: 'analytics', name: 'Analitika', icon: ChartNoAxesCombined },
  { id: 'reviews', name: 'Sharhlar', icon: MessageSquare },
  { id: 'staff', name: 'Xodimlar', icon: Users },
  { id: 'settings', name: 'Sozlamalar', icon: Settings },
] as const;
export default function App() {
  const platform = usePlatform();
  const [adminView, setAdminView] = useState(true);
  useEffect(() => { setAdminView(true); }, [platform.user?.id, platform.user?.role]);
  if (platform.loading && !platform.ready) return <div className="login-page" role="status">Serverga ulanmoqda…</div>;
  if (!platform.demo && !platform.user) return <Login platform={platform} />;
  if (platform.user?.role === 'ADMIN' && adminView) return <AdminPanel platform={platform} openRestaurant={() => setAdminView(false)} />;
  if (!platform.ready) return <div className="login-page"><section className="card login-card"><p role="alert">{platform.error || 'Restoran ma’lumotlari topilmadi.'}</p><button className="button primary" onClick={() => void platform.refresh()}>Qayta urinish</button><button className="button secondary" onClick={() => void platform.logout()}>Chiqish</button></section></div>;
  return <>{platform.user?.role === 'ADMIN' && <div className="admin-return"><button className="button secondary" onClick={() => setAdminView(true)}>SUPER ADMIN paneliga qaytish</button></div>}<PartnerApp key={`${platform.user?.id ?? 'demo'}-${platform.state.restaurantId ?? 'local'}`} platform={platform} /></>;
}

function PartnerApp({ platform }: { platform: Platform }) {
  const { state, setState } = platform;
  const isCourier = platform.user?.role === 'COURIER';
  const [page, setPage] = useState<Page>(() => isCourier || location.pathname === '/courier' ? 'courier' : 'dashboard');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Barchasi');
  const [period, setPeriod] = useState('Bugun');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [newItem, setNewItem] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [courierId, setCourierId] = useState(platform.user?.courierId ?? 2);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); setNewItem(false); setNotifications(false); setMobileNav(false); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  useEffect(() => {
    if (!selected && !newItem) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('[role="dialog"]');
      const elements = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, [selected, newItem]);
  const navigate = (id: Page) => { if (isCourier && id !== 'courier') return; setPage(id); setSearch(''); setFilter('Barchasi'); setMobileNav(false); history.replaceState(null, '', id === 'courier' ? '/courier' : '/'); };
  const activeOrders = state.orders.filter(order => !['Yakunlangan', 'Bekor qilingan'].includes(order.status));
  const completed = state.orders.filter(order => order.status === 'Yakunlangan');
  const revenue = completed.reduce((sum, order) => sum + order.total, 0);
  const completedPercent = completed.length / Math.max(state.orders.length, 1) * 100;
  const cookingPercent = completedPercent + state.orders.filter(o => o.status === 'Tayyorlanmoqda').length / Math.max(state.orders.length, 1) * 100;
  const deliveryPercent = cookingPercent + state.orders.filter(o => o.status === 'Yetkazilmoqda').length / Math.max(state.orders.length, 1) * 100;
  const donutBackground = `conic-gradient(#7b3fef 0 ${completedPercent}%, #ffb75a ${completedPercent}% ${cookingPercent}%, #64a1f8 ${cookingPercent}% ${deliveryPercent}%, #e8ddff ${deliveryPercent}% 100%)`;
  const selectedOrder = state.orders.find(order => order.id === selected);
  const filteredOrders = state.orders.filter(order => (filter === 'Barchasi' || order.status === filter) && `${order.id} ${order.customer} ${order.items}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const updateOrder = async (id: string) => {
    if (!platform.demo) {
      const order = state.orders.find(o => o.id === id)!;
      const to = isCourier ? order.serverStatus === 'READY' ? 'DELIVERING' : 'COMPLETED' : order.serverStatus === 'NEW' ? 'PREPARING' : 'READY';
      const path = isCourier ? `/courier/orders/${id}/transitions` : `/orders/${id}/transitions`;
      if (await platform.mutate(path, 'POST', { to, expectedVersion: order.version })) setNotice('Buyurtma holati saqlandi');
      return;
    }
    try {
      const order = state.orders.find(item => item.id === id)!;
      const next = advanceOrder(order) as Order;
      setState(current => ({ ...current, orders: current.orders.map(item => item.id === id ? next : item), couriers: next.status === 'Yakunlangan' ? current.couriers.map(c => c.id === next.courierId ? { ...c, available: true } : c) : current.couriers }));
      setNotice(`#${id}: ${next.status}`);
    } catch (error) { setNotice((error as Error).message); }
  };
  const attachCourier = async (id: number) => {
    if (!selectedOrder) return;
    if (!platform.demo) {
      if (await platform.mutate(`/orders/${selectedOrder.id}/delivery`, 'POST', { courierId: id, expectedVersion: selectedOrder.version })) setNotice('Kuryer buyurtmaga biriktirildi');
      return;
    }
    try {
      const next = assignCourier(selectedOrder, state.couriers.find(c => c.id === id)!) as Order;
      setState(current => ({ ...current, orders: current.orders.map(o => o.id === next.id ? next : o), couriers: current.couriers.map(c => c.id === id ? { ...c, available: false } : c) }));
      setNotice('Kuryer buyurtmaga biriktirildi');
    } catch (error) { setNotice((error as Error).message); }
  };
  const toggleOpen = () => platform.demo ? setState(s => ({ ...s, open: !s.open })) : void platform.mutate(`/restaurants/${state.restaurantId}`, 'PATCH', { open: !state.open });
  const toggleProduct = (item: AppState['menu'][number]) => platform.demo ? setState(s => ({ ...s, menu: s.menu.map(m => m.id === item.id ? { ...m, available: !m.available } : m) })) : void platform.mutate(`/products/${item.id}`, 'PATCH', { available: !item.available });
  const changeHours = (index: number, patch: Partial<AppState['hours'][number]>) => {
    const hours = state.hours.map((h, i) => i === index ? { ...h, ...patch } : h);
    if (platform.demo) setState(s => ({ ...s, hours }));
    else void platform.mutate(`/restaurants/${state.restaurantId}/working-hours`, 'PUT', hours.map((h, weekday) => ({ weekday, start: h.start, end: h.end, enabled: h.enabled })));
  };
  const togglePromotion = (promo: AppState['promotions'][number]) => platform.demo ? setState(s => ({ ...s, promotions: s.promotions.map(p => p.id === promo.id ? { ...p, active: !p.active } : p) })) : void platform.mutate(`/restaurants/${state.restaurantId}/promotions/${promo.id}`, 'PATCH', { active: !promo.active });
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const patch = { restaurant: String(data.get('restaurant')).trim(), phone: String(data.get('phone')).trim() };
    if (platform.demo) { setState(s => ({ ...s, ...patch })); setNotice('Restoran sozlamalari saqlandi'); }
    else if (await platform.mutate(`/restaurants/${state.restaurantId}`, 'PATCH', { name: patch.restaurant, phone: patch.phone })) setNotice('Restoran sozlamalari saqlandi');
  };
  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const item = { name: String(data.get('name')).trim(), price: Number(data.get('price')), category: String(data.get('category')), emoji: '🍽️', available: true };
    if (platform.demo) { setState(s => ({ ...s, menu: [...s.menu, { id: Date.now(), ...item }] })); setNewItem(false); setNotice('Yangi taom menyuga qo‘shildi'); }
    else if (await platform.mutate('/products', 'POST', item)) { setNewItem(false); setNotice('Yangi taom menyuga qo‘shildi'); }
  };
  const reviews = platform.demo ? [{ name: 'Madina R.', text: 'Osh juda mazali, issiq holatda yetib keldi. Rahmat!', score: 5 }, { name: 'Sardor A.', text: 'Buyurtma o‘z vaqtida keldi, porsiyalar ham yaxshi.', score: 5 }, { name: 'Javohir T.', text: 'Taomlar zo‘r. Qadoqlashni biroz yaxshilash mumkin.', score: 4.7 }] : state.reviews ?? [];
  const employees = platform.demo ? [{ id: 0, name: 'Azizbek Bekov', email: '', active: true }] : state.employees ?? [];
  const canAdvance = (order: Order) => platform.demo ? !['Yakunlangan', 'Bekor qilingan'].includes(order.status) : isCourier ? ['READY', 'DELIVERING'].includes(order.serverStatus ?? '') : ['NEW', 'PREPARING'].includes(order.serverStatus ?? '');
  const nextLabel = (order: Order) => platform.demo ? order.status === 'Yangi' ? 'Buyurtmani qabul qilish' : order.status === 'Tayyorlanmoqda' ? 'Yetkazishga yuborish' : 'Yetkazildi — yakunlash' : order.serverStatus === 'NEW' ? 'Buyurtmani qabul qilish' : order.serverStatus === 'PREPARING' ? 'Tayyor — kuryerga topshirish' : order.serverStatus === 'READY' ? 'Buyurtmani olib ketdim' : 'Yetkazib berdim';
  const exportOrders = () => {
    const csv = '\uFEFFID,Mijoz,Summa,Holat,Kuryer turi\n' + state.orders.map(o => [o.id, o.customer, o.total, o.status, o.delivery].join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tezkor-buyurtmalar.csv'; a.click(); URL.revokeObjectURL(url);
    setNotice('Hisobot CSV formatida yuklandi');
  };
  const orderTable = (compact = false) => <div className="table-scroll"><table><thead><tr><th>Buyurtma / mijoz</th><th>Taomlar</th><th>Summa</th><th>Holat</th><th>Vaqt</th><th aria-label="Tafsilot" /></tr></thead><tbody>{(compact ? filteredOrders.slice(0, 5) : filteredOrders).map(order => <tr key={order.id} onClick={() => setSelected(order.id)}><td><div className="customer"><span className={`avatar color-${Number(order.id) % 4}`}>{order.initials}</span><div><b>#{order.id}</b><small>{order.customer}</small></div></div></td><td className="items-cell">{order.items}</td><td><b>{money(order.total)}</b><small>so‘m</small></td><td><span className={`badge status-${order.status === 'Yangi' ? 'new' : order.status === 'Tayyorlanmoqda' ? 'cooking' : order.status === 'Yetkazilmoqda' ? 'delivery' : 'done'}`}><i />{order.status}</span></td><td className="muted">{order.time}</td><td><button className="icon-button" aria-label={`#${order.id} buyurtmani ochish`} onClick={e => { e.stopPropagation(); setSelected(order.id); }}><ChevronRight size={17} /></button></td></tr>)}</tbody></table>{!filteredOrders.length && <div className="empty">Buyurtma topilmadi. Qidiruv yoki filtrni o‘zgartiring.</div>}</div>;
  const stats = <div className="stats-grid">{[
    { title: 'Jami tushum', value: money(revenue), unit: 'so‘m', caption: 'Yakunlangan buyurtmalardan', icon: Wallet, color: 'purple' },
    { title: 'Buyurtmalar', value: state.orders.length, unit: 'ta', caption: `${completed.length} ta muvaffaqiyatli yakunlangan`, icon: ShoppingBag, color: 'orange' },
    { title: 'O‘rtacha chek', value: money(state.orders.length ? Math.round(state.orders.reduce((s, o) => s + o.total, 0) / state.orders.length) : 0), unit: 'so‘m', caption: 'Yuklangan buyurtmalar bo‘yicha', icon: CreditCard, color: 'blue' },
    { title: 'Restoran reytingi', value: reviews.length ? (reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length).toFixed(1) : '—', unit: '/ 5', caption: `${reviews.length} ta ${platform.demo ? 'demo ' : ''}sharh asosida`, icon: Star, color: 'green' },
  ].map(stat => <section className="card stat" key={stat.title}><div className="stat-top"><span>{stat.title}</span><span className={`stat-icon ${stat.color}`}><stat.icon size={19} /></span></div><div className="stat-value">{stat.value} <small>{stat.unit}</small></div><div className="stat-caption">{stat.caption}</div></section>)}</div>;

  return <div className={`app ${page === 'courier' ? 'courier-mode' : ''}`}>
    {mobileNav && <button className="nav-backdrop" aria-label="Menyuni yopish" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'visible' : ''}`}>
      <a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('dashboard'); }}><span className="brand-mark"><Zap fill="currentColor" size={25} /></span><span>tezkor<span className="brand-partner">PARTNER</span></span></a>
      <button className="restaurant-switch" onClick={() => navigate('settings')}><span className="restaurant-logo">O<span>•</span></span><span><b>{state.restaurant}</b><small>Toshkent · Asosiy filial</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">BOSHQARUV</div>
      <nav>{navigation.filter(() => !isCourier).map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.name}</span>{item.id === 'orders' && <span className="nav-count">{activeOrders.length}</span>}{item.id === 'reviews' && <span className="nav-dot" />}</button>)}</nav>
      <div className="nav-label delivery-label">YETKAZIB BERISH</div>
      <button className={`nav-item ${page === 'courier' ? 'active' : ''}`} onClick={() => navigate('courier')}><Bike size={20} /><span>Kuryer ilovasi</span><ArrowUpRight size={15} /></button>
      <div className="sidebar-bottom"><div className="help-box"><span className="help-icon"><Headphones size={21} /></span><b>Yordam kerakmi?</b><p>Hamkorlar xizmatiga murojaat qiling</p><button onClick={() => setNotice('Demo yordam xizmati: support@example.com. Haqiqiy aloqa backend bosqichida sozlanadi.')}>Yordam markazi <ArrowUpRight size={14} /></button></div><div className="profile"><span className="profile-avatar">AB</span><span><b>{platform.user?.name ?? 'Azizbek Bekov'}</b><small>{isCourier ? 'Kuryer' : 'Restoran xodimi'}</small></span><button className="icon-button" aria-label="Profil sozlamalari" onClick={() => navigate('settings')}><Settings size={17} /></button></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Menyu"><Menu size={22} /></button><Store size={16} /><span>Restoran paneli</span><ChevronRight size={14} /><b>{page === 'courier' ? 'Kuryer ilovasi' : navigation.find(n => n.id === page)?.name}</b></div><div className="top-actions"><span className="demo-tag">{platform.demo ? 'LOKAL DEMO' : state.isDemo ? 'DEMO BAZA' : 'BACKEND'}</span><button className="text-button" disabled={platform.pending} onClick={() => void platform.refresh()}>Yangilash</button>{!platform.demo && <button className="text-button" disabled={platform.pending} onClick={() => void platform.logout()}>Chiqish</button>}<span className={`live-indicator ${state.open ? '' : 'closed'}`}><i />{state.open ? 'Restoran ochiq' : 'Restoran yopiq'}</span><button className="switch" role="switch" aria-checked={state.open} aria-label="Restoran ochiqligi" disabled={platform.pending || isCourier} onClick={toggleOpen}><span className={state.open ? 'on' : ''} /></button><span className="divider" /><button className="notification-button icon-button" aria-label="Bildirishnomalar" onClick={() => setNotifications(!notifications)}><Bell size={20} /><i /></button><span className="small-profile">AB</span></div></header>
      {notifications && <div className="notification-popover card"><b>Bildirishnomalar</b><p>{activeOrders.length} ta faol buyurtma bor.</p><button className="text-button" onClick={() => { navigate('orders'); setNotifications(false); }}>Buyurtmalarni ko‘rish <ArrowUpRight size={15} /></button></div>}
      <main aria-busy={platform.pending}>{platform.error && <div className="info-note api-error" role="alert">{platform.error}<button className="text-button" onClick={() => void platform.refresh()}>Qayta urinish</button></div>}{platform.pending && <div className="info-note" role="status">Saqlanmoqda…</div>}{state.truncated && <div className="info-note">Oxirgi 500 ta buyurtma ko‘rsatilmoqda. To‘liq ro‘yxat sahifalangan /orders API orqali olinadi.</div>}{platform.user?.role === 'ADMIN' && <label className="select-control">Restoran<select disabled={platform.pending} value={state.restaurantId} onChange={e => void platform.selectRestaurant(Number(e.target.value))}>{platform.restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
        <div className="page-heading"><div><div className="eyebrow">SIZNING BIZNESINGIZ, BIR JOYDA</div><h1>{page === 'dashboard' ? 'Umumiy ko‘rinish' : page === 'courier' ? 'Kuryer ish maydoni' : navigation.find(n => n.id === page)?.name}<span className="heading-dot">.</span></h1><p>{page === 'dashboard' ? 'Xayrli kun, Azizbek! Restoraningiz bugun qanday ishlayotganini kuzating.' : page === 'courier' ? 'Yetkazib berishlar, manzillar va buyurtma holatlari.' : `${state.restaurant} faoliyatini qulay boshqaring.`}</p></div><div className="heading-actions">{page === 'dashboard' || page === 'analytics' ? <label className="select-control"><CalendarDays size={16} /><select value={period} onChange={e => setPeriod(e.target.value)}><option>Bugun</option><option>Shu hafta</option><option>Shu oy</option></select></label> : null}<button className="button secondary" onClick={exportOrders}><Download size={16} /><span>Hisobotni yuklash</span></button></div></div>

        {(page === 'dashboard' || page === 'analytics') && <>
          <div className="welcome-banner"><div className="banner-icon"><Sparkles size={23} /></div><div><b>Har bir buyurtma — yangi imkoniyat</b><p>Tezkor xizmat va mazali taomlar bilan mijozlaringizni xursand qiling.</p></div><button onClick={() => navigate('promotions')}>Aksiya yaratish <ArrowUpRight size={17} /></button><div className="banner-decoration">✳</div></div>
          {stats}
          <div className="charts-grid"><section className="card revenue-card"><div className="section-heading"><div><h2>Tushum dinamikasi</h2><p>Demo ma’lumotlar · {period.toLowerCase()}</p></div><div className="chart-legend"><i />Tushum <select aria-label="Grafik davri" value={period} onChange={e => setPeriod(e.target.value)}><option>Bugun</option><option>Shu hafta</option><option>Shu oy</option></select></div></div><div className="chart-total">{money(revenue)} <small>so‘m</small><span className="neutral-chip">{completed.length} ta yakunlangan</span></div><div className="revenue-chart"><div className="chart-y"><span>400 ming</span><span>300 ming</span><span>200 ming</span><span>100 ming</span><span>0</span></div><div className="chart-drawing"><svg viewBox="0 0 700 180" preserveAspectRatio="none" role="img" aria-label="Namuna tushum grafigi: davr davomida o‘suvchi tushum"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8551f3" stopOpacity=".19" /><stop offset="1" stopColor="#8551f3" stopOpacity="0" /></linearGradient></defs>{[15, 55, 95, 135, 175].map(y => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#eeedf3" strokeDasharray="4 5" />)}<path d={period === 'Bugun' ? 'M0 153 C30 153 35 155 65 137 S115 160 150 132 S198 148 230 107 S280 134 315 90 S360 107 395 60 S443 98 475 60 S520 62 550 35 S600 50 630 24 S665 32 700 8 L700 180 L0 180Z' : 'M0 165 C75 155 75 80 150 120 S225 120 300 60 S375 115 450 50 S550 70 600 25 S660 30 700 8 L700 180 L0 180Z'} fill="url(#area)" /><path d={period === 'Bugun' ? 'M0 153 C30 153 35 155 65 137 S115 160 150 132 S198 148 230 107 S280 134 315 90 S360 107 395 60 S443 98 475 60 S520 62 550 35 S600 50 630 24 S665 32 700 8' : 'M0 165 C75 155 75 80 150 120 S225 120 300 60 S375 115 450 50 S550 70 600 25 S660 30 700 8'} fill="none" stroke="#8145ed" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="chart-x">{(period === 'Bugun' ? ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00', '23:00'] : period === 'Shu hafta' ? ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'] : ['1', '5', '10', '15', '20', '25', '30']).map(x => <span key={x}>{x}</span>)}</div></div></div></section>
          <section className="card order-summary"><div className="section-heading"><h2>Buyurtmalar holati</h2><ShoppingBag size={18} className="muted" /></div><div className="donut" style={{ background: donutBackground }}><div><strong>{state.orders.length}</strong><span>jami buyurtma</span></div></div><div className="summary-legend">{[{ status: 'Yakunlangan', color: '#7b3fef' }, { status: 'Tayyorlanmoqda', color: '#ffb75a' }, { status: 'Yetkazilmoqda', color: '#64a1f8' }, { status: 'Yangi', color: '#e8ddff' }].map(s => <div key={s.status}><i style={{ background: s.color }} /><span>{s.status}</span><b>{state.orders.filter(o => o.status === s.status).length}</b></div>)}</div></section></div>
        </>}

        {(page === 'dashboard' || page === 'orders') && <div className={page === 'dashboard' ? 'bottom-grid' : ''}><section className="card orders-card"><div className="section-heading"><div className="heading-inline"><h2>{page === 'dashboard' ? 'So‘nggi buyurtmalar' : 'Barcha buyurtmalar'}</h2><span className="count-chip">{state.orders.length}</span></div>{page === 'dashboard' ? <button className="text-button" onClick={() => navigate('orders')}>Barchasini ko‘rish <ArrowUpRight size={15} /></button> : <span className="muted">{activeOrders.length} ta faol</span>}</div><div className="table-toolbar"><div className="tabs">{['Barchasi', 'Yangi', 'Tayyorlanmoqda', ...(page === 'orders' ? ['Yetkazilmoqda', 'Yakunlangan'] : [])].map(tab => <button key={tab} className={filter === tab ? 'selected' : ''} onClick={() => setFilter(tab)}>{tab}{tab === 'Yangi' && <span>{state.orders.filter(o => o.status === 'Yangi').length}</span>}</button>)}</div><label className="search-field"><Search size={15} /><input placeholder="Buyurtmani qidirish" value={search} onChange={e => setSearch(e.target.value)} /></label></div>{orderTable(page === 'dashboard')}<div className="table-footer"><span>{filteredOrders.length} ta buyurtmadan {page === 'dashboard' ? Math.min(filteredOrders.length, 5) : filteredOrders.length} tasi ko‘rsatilmoqda</span><span className="page-number">1</span></div></section>{page === 'dashboard' && <div className="right-stack"><section className="card delivery-card"><div className="section-heading"><h2>Yetkazib berish</h2><span className="purple-icon"><Bike size={21} /></span></div><div className="delivery-service"><span className="service-icon internal"><Users size={19} /></span><div><b>Ichki kuryerlar</b><small>Restoran jamoasi</small></div><strong>{state.couriers.filter(c => c.type === 'internal' && c.available).length}<small>bo‘sh</small></strong></div><div className="delivery-service"><span className="service-icon external"><Zap size={19} /></span><div><b>Tashqi xizmat</b><small>Hamkor yetkazib berish</small></div><span className="badge status-cooking">Ulanmagan</span></div><button className="button secondary full" onClick={() => navigate('courier')}>Kuryerlarni boshqarish <ArrowUpRight size={15} /></button></section><section className="tip-card"><span className="tip-icon"><TrendingUp size={21} /></span><h3>Savdoni birga oshiramiz</h3><p>Menyuni yangilab turing va mijozlar uchun maxsus takliflar yarating.</p><button className="text-button" onClick={() => navigate('menu')}>Menyuga o‘tish <ArrowUpRight size={15} /></button></section></div>}</div>}

        {page === 'menu' && <><div className="content-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Taom nomi bo‘yicha qidirish" value={search} onChange={e => setSearch(e.target.value)} /></label><button className="button primary" onClick={() => setNewItem(true)}><Plus size={17} />Taom qo‘shish</button></div><div className="menu-grid">{state.menu.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <article className="card menu-card" key={item.id}><div className="food-visual">{item.emoji}<span className="food-category">{item.category}</span></div><div className="menu-content"><h2>{item.name}</h2><p>{money(item.price)} so‘m</p><div className="menu-availability"><span>{item.available ? 'Sotuvda mavjud' : 'Vaqtincha mavjud emas'}</span><button className="switch" role="switch" aria-checked={item.available} aria-label={`${item.name} mavjudligi`} disabled={platform.pending} onClick={() => toggleProduct(item)}><span className={item.available ? 'on' : ''} /></button></div></div></article>)}</div></>}

        {page === 'hours' && <section className="card form-card"><h2>Haftalik ish jadvali</h2><p className="muted">{platform.demo ? 'O‘zgarishlar shu brauzerda saqlanadi.' : 'Jadval serverda saqlanadi. Hozircha buyurtma qabul qilish ochiq/yopiq tugmasi bilan boshqariladi.'}</p>{state.hours.map((day, index) => <div className="hours-row" key={day.day}><b>{day.day}</b><input type="time" aria-label={`${day.day} ochilish vaqti`} value={day.start} disabled={!day.enabled || platform.pending} onChange={e => changeHours(index, { start: e.target.value })} /><span>—</span><input type="time" aria-label={`${day.day} yopilish vaqti`} value={day.end} disabled={!day.enabled || platform.pending} onChange={e => changeHours(index, { end: e.target.value })} /><button className="switch" role="switch" aria-checked={day.enabled} aria-label={`${day.day} ish kuni`} disabled={platform.pending} onClick={() => changeHours(index, { enabled: !day.enabled })}><span className={day.enabled ? 'on' : ''} /></button></div>)}</section>}

        {page === 'promotions' && <><div className="info-note"><Sparkles size={18} />{platform.demo ? 'Aksiyalar demo rejimida saqlanadi.' : 'Aksiyalar serverda saqlanadi.'} Chegirmalar buyurtma summalariga hali qo‘llanmaydi.</div><div className="two-columns">{state.promotions.map(promo => <section className="card promo-card" key={promo.id}><span className="promo-percent">−{promo.discount}%</span><div><h2>{promo.name}</h2><p className="muted">Barcha asosiy taomlar uchun maxsus taklif</p></div><button className={`button ${promo.active ? 'secondary' : 'primary'}`} disabled={platform.pending} onClick={() => togglePromotion(promo)}>{promo.active ? 'To‘xtatish' : 'Faollashtirish'}</button></section>)}</div></>}

        {page === 'finance' && <>{stats}<section className="card"><div className="section-heading"><div><h2>Yakunlangan buyurtmalar tushumi</h2><p>Demo hisoboti · haqiqiy to‘lov integratsiyasi ulanmagan</p></div><button className="button secondary" onClick={exportOrders}><Download size={16} />CSV eksport</button></div><div className="finance-total"><Wallet size={26} /><strong>{money(revenue)} <small>so‘m</small></strong></div>{completed.map(o => <div className="transaction" key={o.id}><span className="service-icon internal"><ArrowDownLeft size={20} /></span><div><b>Buyurtma #{o.id}</b><small>{o.customer} · {o.time}</small></div><strong>+{money(o.total)} so‘m</strong></div>)}</section></>}

        {page === 'reviews' && <div className="two-columns">{reviews.map(review => <article className="card review-card" key={review.name + review.text}><div className="section-heading"><b>{review.name}</b><span className="stars"><Star size={15} fill="currentColor" />{review.score}</span></div><p>{review.text}</p><small className="muted">{platform.demo ? 'Namuna sharh · demo ma’lumot' : state.isDemo ? 'Demo bazadagi sharh' : 'Buyurtma sharhi'}</small></article>)}{!reviews.length && <div className="empty">Hozircha sharh yo‘q.</div>}</div>}

        {page === 'staff' && <section className="card"><div className="section-heading"><h2>Jamoa va kuryerlar</h2><span className="count-chip">{state.couriers.length + employees.length} kishi</span></div>{employees.map(e => <div className="transaction" key={e.id}><span className="profile-avatar"><Users size={18} /></span><div><b>{e.name}</b><small>Restoran xodimi {e.email}</small></div><span className="badge status-done">{e.active ? 'Faol' : 'Nofaol'}</span></div>)}{state.couriers.map(c => <div className="transaction" key={c.id}><span className={`service-icon ${c.type === 'internal' ? 'internal' : 'external'}`}><Bike size={20} /></span><div><b>{c.name}</b><small>{c.type === 'internal' ? 'Ichki kuryer' : 'Tashqi hamkor'}</small></div><span className={`badge ${c.available ? 'status-done' : 'status-cooking'}`}>{c.available ? 'Bo‘sh' : 'Buyurtmada'}</span></div>)}</section>}

        {page === 'settings' && <form className="card form-card settings-form" onSubmit={saveSettings}><h2>Restoran ma’lumotlari</h2><p className="muted">Asosiy filial · Toshkent, O‘zbekiston</p><label>Restoran nomi<input name="restaurant" defaultValue={state.restaurant} required maxLength={60} /></label><label>Telefon raqami<input name="phone" type="tel" defaultValue={state.phone} required pattern="\+?[0-9 ()-]{9,20}" /></label><label>Valyuta<input value="O‘zbekiston so‘mi (UZS)" disabled /></label><div className="info-note"><Store size={18} />{platform.demo ? 'Lokal demo. Haqiqiy backend bilan ulanmagan.' : 'Sessiya va restoran ruxsatlari serverda tekshiriladi.'}</div><button disabled={platform.pending} className="button primary" type="submit"><Check size={17} />O‘zgarishlarni saqlash</button></form>}

        {page === 'courier' && <><div className="courier-banner"><span className="courier-banner-icon"><Bike size={36} /></span><div><h2>Yo‘lga tayyormisiz?</h2><p>Buyurtmalarni qabul qiling va yetkazib berishni kuzating.</p></div>{platform.demo ? <label className="select-control"><select aria-label="Demo kuryerni tanlash" value={courierId} onChange={e => setCourierId(Number(e.target.value))}>{state.couriers.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label> : <b>{platform.user?.name}</b>}</div><div className="info-note"><MapPin size={18} />{platform.demo ? 'Lokal demo rol tanlagichi. GPS ulanmagan.' : isCourier ? 'Faqat o‘zingizning topshiriqlaringiz. Ro‘yxat har 10 soniyada yangilanadi. GPS ulanmagan.' : 'Bu dispetcher ko‘rinishi. Kuryer ishlashi uchun o‘z hisobi bilan kirishi kerak.'}</div><div className="two-columns"><section className="card"><div className="section-heading"><h2>{isCourier || platform.demo ? 'Mening yetkazib berishlarim' : 'Faol yetkazib berishlar'}</h2></div>{activeOrders.filter(o => platform.demo || isCourier ? o.courierId === courierId : !!o.courierId).map(o => <div className="courier-job" key={o.id}><div className="heading-inline"><b>Buyurtma #{o.id}</b><span className="badge status-delivery">{o.serverStatus === 'READY' ? 'Tayyor' : o.status}</span></div><p><Store size={16} />{state.restaurant}</p><p><MapPin size={16} />{o.address}</p><p className="muted">{o.items}</p>{(platform.demo || isCourier) && <button className="button primary full" disabled={platform.pending || !canAdvance(o) || o.status === 'Yangi'} onClick={() => void updateOrder(o.id)}>{canAdvance(o) ? nextLabel(o) : 'Restoran tayyorlashi kutilmoqda'}</button>}</div>)}{!activeOrders.some(o => platform.demo || isCourier ? o.courierId === courierId : !!o.courierId) && <div className="empty"><Bike size={34} /><p>Hozircha biriktirilgan buyurtma yo‘q.</p></div>}</section><section className="card"><div className="section-heading"><h2>{isCourier ? 'Qabul qilish uchun buyurtmalar' : 'Kuryer biriktirish'}</h2><Package size={19} /></div>{activeOrders.filter(o => !o.courierId).map(o => <div className="transaction" key={o.id}><div><b>#{o.id} · {o.customer}</b><small>{isCourier ? state.restaurant : o.address}</small></div><button className="button secondary" disabled={platform.pending} onClick={() => isCourier ? void platform.mutate('/courier/orders/' + o.id + '/accept', 'POST', { expectedVersion: o.version }) : setSelected(o.id)}>{isCourier ? 'Qabul qilish' : 'Biriktirish'}</button></div>)}{!activeOrders.some(o => !o.courierId) && <div className="empty">Hozircha buyurtma yo‘q.</div>}</section></div></>}
        <footer><span>© {new Date().getFullYear()} Tezkor Partner</span><span>Hamkorlikda yanada tezkor <Zap size={12} /></span><span>{platform.demo ? 'Lokal demo' : state.isDemo ? 'Demo PostgreSQL' : 'PostgreSQL'} · v0.2.0</span></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={18} />{notice}<button className="icon-button" onClick={() => setNotice('')} aria-label="Xabarni yopish"><X size={16} /></button></div>}
    {selectedOrder && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="modal card" role="dialog" aria-modal="true" aria-labelledby="order-title" onClick={e => e.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">BUYURTMA TAFSILOTLARI</span><h2 id="order-title">Buyurtma #{selectedOrder.id}</h2></div><button autoFocus className="icon-button" aria-label="Yopish" onClick={() => setSelected(null)}><X /></button></div><div className="modal-content"><div className="detail-row"><span>Mijoz</span><b>{selectedOrder.customer}</b></div><div className="detail-row"><span>Holat</span><b>{selectedOrder.status}</b></div><p className="address"><MapPin size={18} />{selectedOrder.address}</p><div className="order-items">{selectedOrder.items}</div><div className="detail-row"><span>Jami summa</span><strong>{money(selectedOrder.total)} so‘m</strong></div><h3>Yetkazib berish xizmati</h3>{selectedOrder.courierId ? <div className="info-note"><Bike size={19} />{state.couriers.find(c => c.id === selectedOrder.courierId)?.name} · {selectedOrder.delivery === 'internal' ? 'Ichki kuryer' : 'Tashqi xizmat'}</div> : <><p className="muted">Bo‘sh ichki yoki tashqi kuryerni tanlang.</p>{state.couriers.filter(c => c.available).map(c => <button className="courier-option" key={c.id} disabled={platform.pending} onClick={() => void attachCourier(c.id)}><Bike size={19} /><span>{c.name}<small>{c.type === 'internal' ? 'Ichki kuryer' : 'Tashqi hamkor'}</small></span><Plus size={17} /></button>)}</>}{canAdvance(selectedOrder) && <button disabled={platform.pending} className="button primary full next-status" onClick={() => updateOrder(selectedOrder.id)}>{nextLabel(selectedOrder)}<ChevronRight size={17} /></button>}</div></section></div>}
    {newItem && <div className="modal-backdrop" onClick={() => setNewItem(false)}><form className="modal card settings-form" role="dialog" aria-modal="true" aria-labelledby="item-title" onClick={e => e.stopPropagation()} onSubmit={addItem}><div className="section-heading"><h2 id="item-title">Yangi taom</h2><button type="button" className="icon-button" aria-label="Yopish" onClick={() => setNewItem(false)}><X /></button></div><div className="modal-content"><label>Taom nomi<input autoFocus name="name" required maxLength={80} pattern=".*\S.*" /></label><label>Narxi (so‘m)<input name="price" type="number" min="1000" max="10000000" step="1000" required /></label><label>Kategoriya<select name="category"><option>Asosiy taomlar</option><option>Salatlar</option><option>Pishiriqlar</option><option>Ichimliklar</option></select></label><button disabled={platform.pending} className="button primary full" type="submit"><Plus size={17} />Menyuga qo‘shish</button></div></form></div>}
  </div>;
}
