# FOOD / Tezkor Partner — 2-bosqich

Mustaqil restoran boshqaruv paneli va `/courier` interfeysi. Uzum yoki boshqa yetkazib berish kompaniyasining rasmiy mahsuloti emas.

Mavjud React 19 + TypeScript + Vite, komponentlar va CSS saqlangan. `server/` ichida Node.js + TypeScript + Express 5, Prisma 6.19 va PostgreSQL backend qo‘shildi. Barcha kirish ma’lumotlari Zod bilan tekshiriladi.

## Rejimlar

- **Backend (standart):** haqiqiy login va server API. Backend/baza ishlamasa xato ko‘rsatiladi; demo ma’lumotlarga avtomatik o‘tmaydi. Ma’lumotlar localStorage’da saqlanmaydi.
- **Lokal demo:** ildiz `.env.local` faylida `VITE_DEMO_MODE=true`, so‘ng Vite’ni qayta ishga tushiring. Birinchi bosqich funksiyalari va `tezkor-partner:v1` localStorage saqlanadi. API chaqirilmaydi. Bu haqiqiy autentifikatsiya emas.
- **Demo PostgreSQL:** alohida `*_demo` baza, seed va `isDemo` belgisi. Panelda `DEMO BAZA` ko‘rsatiladi. Haqiqiy restoranlar uchun alohida baza ishlating va seed bajarmang.

## Talablar

Node.js 22.12+ yoki 24 LTS, npm, PostgreSQL 17 yoki Docker Desktop + Compose. Ushbu sessiyada Node 26.13.1 bilan tekshirildi.

**Ushbu kompyuterdagi cheklov:** Docker/psql topilmadi va `127.0.0.1:5432` ga ulanish `P1001` bilan tugadi. Shuning uchun migratsiya, seed va PostgreSQL integratsiya testlari bu muhitda bajarilgan deb hisoblanmaydi. Sxema, SQL migratsiyalar, seed, Compose va haqiqiy baza uchun testlar tayyorlangan. Brauzer testlari API javoblarini taqlid qiladi; ular haqiqiy baza sinovi emas.

## Lokal ishga tushirish (PowerShell)

Loyiha ildizida:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
npm.cmd ci
npm.cmd ci --prefix server
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

Agar `.env` allaqachon mavjud bo‘lsa, nusxalash o‘rniga kerakli qiymatlarni tahrirlang. `.env` fayllari Git’ga kiritilmaydi.

1. Ildiz `.env` ichida `POSTGRES_PASSWORD` uchun o‘zingiz tanlagan kuchli parolni yozing.
2. `server/.env` ichidagi `DATABASE_URL` ni shu foydalanuvchi/parol va `tezkor_demo` bazasiga moslang. URL parolidagi maxsus belgilar percent-encoding qilinadi.
3. `server/.env` ichida `ALLOW_DEMO_SEED=true`, `DEMO_PASSWORD` uchun kamida 12 belgili o‘zingiz tanlagan parolni belgilang. To‘rtta `DEMO_*_EMAIL` namuna emailini saqlash yoki almashtirish mumkin. Kodda tayyor parol yo‘q.
4. `APP_ORIGIN=http://127.0.0.1:5173` bo‘lsin. Brauzerda aynan shu origin’dan foydalaning; `localhost` boshqa origin.

```powershell
docker compose up -d --wait
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run server:dev
```

Ikkinchi terminalda:

```powershell
npm.cmd run dev -- --port 5173 --strictPort
```

- Restoran: http://127.0.0.1:5173/
- Kuryer: http://127.0.0.1:5173/courier
- Baza salomatligi: http://127.0.0.1:3001/api/v1/health

Restoran xodimi va kuryerni **alohida brauzer profili yoki inkognito oynada** oching: bir origin’dagi tablar bir HttpOnly cookie sessiyasini bo‘lishadi.

Seed to‘rtta hisob yaratadi: platforma admini, birinchi restoran xodimi, birinchi restoran kuryeri, ikkinchi restoran xodimi. Email va parol `server/.env` dan olinadi. Seed qayta ishga tushirilganda mavjud yozuvlar/parollarni qayta yozmaydi; hech narsani o‘chirmaydi.

## Docker bo‘lmasa

1. [Docker Desktop for Windows rasmiy qo‘llanmasi](https://docs.docker.com/desktop/setup/install/windows-install/) bo‘yicha Docker Desktop o‘rnating.
2. Windows talablariga ko‘ra virtualization va WSL 2’ni yoqing; kerak bo‘lsa kompyuterni qayta ishga tushiring.
3. Docker Desktop’ni ishga tushiring, Linux containers rejimidan foydalaning va terminalda `docker version` hamda `docker compose version` ni tekshiring.
4. Yuqoridagi `docker compose up -d --wait` dan davom eting.

Muqobil: [PostgreSQL Windows installer](https://www.postgresql.org/download/windows/) orqali PostgreSQL o‘rnating, alohida foydalanuvchi va `tezkor_demo` bazasini yarating, `DATABASE_URL` ni moslang; Compose talab qilinmaydi. Kompyuterga Docker yoki PostgreSQL avtomatik o‘rnatilmadi.

`docker compose stop` bazani to‘xtatadi; ma’lumot named volume’da qoladi. Baza fayllarini o‘chirish ishga tushirish uchun talab qilinmaydi.

## Buyurtma oqimini tekshirish

1. Restoran xodimi bilan kiring; `Yangi` buyurtmani qabul qiling: `NEW → PREPARING`.
2. Taom tayyor bo‘lgach `Tayyor — kuryerga topshirish`: `PREPARING → READY`.
3. Restoran bo‘sh kuryerni biriktirishi mumkin. Yoki kuryer `/courier` orqali shu restoranning biriktirilmagan `READY` buyurtmasini qabul qiladi.
4. Kuryer `Buyurtmani olib ketdim`: `READY → DELIVERING`.
5. Faqat biriktirilgan kuryer `Yetkazib berdim`: `DELIVERING → COMPLETED`. Delivery va kuryer bandligi bitta tranzaksiyada yangilanadi.
6. Restoran ma’lumotlari har 10 soniyada yoki `Yangilash` orqali qayta olinadi. Xatoda o‘zgarish saqlangandek ko‘rsatilmaydi.

Server orqali menyu mavjudligi, yangi taom, restoran nomi/telefoni/ochiqligi, ish jadvali va aksiya holati saqlanadi. Sharhlar va xodimlar bazadan o‘qiladi. Admin restoran tanlay oladi. Restoran/buyurtma yaratish va hisoblar qo‘shish API orqali mavjud; alohida mijoz checkout ilovasi yaratilmagan.

## Haqiqiy bazada birinchi administrator

Demo seed’ni bajarmang. Migratsiyadan keyin xavfsiz mahalliy muhit orqali `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` belgilang va:

```powershell
npm.cmd run admin:create --prefix server
Remove-Item Env:ADMIN_PASSWORD
```

Bu buyruq mavjud hisobni o‘zgartirmaydi. Restoran va xodim/kuryer hisoblarini autentifikatsiyadan keyin admin API orqali yaratadi; ommaviy ro‘yxatdan o‘tish yo‘q.

## Tekshiruvlar

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build:all
npm.cmd run test:browser
npm.cmd audit
npm.cmd audit --prefix server
```

Brauzer testlari o‘rnatilgan Google Chrome’dan foydalanadi. Chrome bo‘lmasa Playwright config’dagi `channel: 'chrome'` ni olib tashlab, `npx.cmd playwright install chromium` bajaring. Testlar 5178/5179 portlarini ishlatadi.

Haqiqiy PostgreSQL testlari uchun **alohida `*_test` baza** yarating. `TEST_DATABASE_URL` o‘rnatilmagan bo‘lsa test aniq `skipped` bo‘ladi. Migratsiya uchun `DATABASE_URL` ham shu test bazasiga vaqtincha moslanadi:

```powershell
# TEST_DATABASE_URL ni o‘z test bazangizning haqiqiy URL qiymatiga o‘rnating.
$previousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm.cmd run db:migrate
npm.cmd test --prefix server
if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL } else { $env:DATABASE_URL = $previousDatabaseUrl }
```

Testlar ikki restoran o‘rtasidagi izolyatsiya, narx snapshotlari, parallel biriktirish, boshqa kuryerning status yangilay olmasligi va sessiya bekor qilinishini tekshiradi. Faqat shu test yaratgan yozuvlar tozalanadi; baza reset qilinmaydi. Natijalar: [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Production yig‘ilma

```powershell
npm.cmd run build:all
npm.cmd run server:start
```

`NODE_ENV=production`, haqiqiy `DATABASE_URL`, tashqi HTTPS origin uchun `APP_ORIGIN` belgilanadi. Reverse proxy `dist/` frontendni beradi, `/api` ni `127.0.0.1:3001` ga uzatadi; `/courier` va frontend yo‘llari `index.html` ga qaytariladi. Production cookie `Secure` bo‘lgani uchun HTTPS shart. Backend ataylab loopback’da tinglaydi.

Lokal production preview uchun `APP_ORIGIN=http://127.0.0.1:4173`, `NODE_ENV=development` bilan backendni qayta ishga tushiring, `npm.cmd run preview -- --port 4173 --strictPort` bajaring. Bu production hosting o‘rnini bosmaydi.

## Chegaralar

Haqiqiy to‘lov, GPS, tashqi kuryer provayderi va push/WebSocket ulanmagan. Tashqi xizmat panelda `Ulanmagan` deb ko‘rsatiladi. [Kengaytirish interfeyslari](server/src/providers.ts) va [talablar](docs/INTEGRATIONS.md) mavjud.

Tushum yuklangan yakunlangan buyurtmalar summasi; haqiqiy pul o‘tkazmasi emas. `/state` eng ko‘pi 500 buyurtma qaytaradi; cheklov panelda ko‘rsatiladi, to‘liq ro‘yxat cursor API bilan olinadi. Chiziqli grafik namuna deb belgilangan; davr tanlovi haqiqiy moliyaviy hisobot yaratmaydi. Ish jadvali saqlanadi, lekin avtomatik ochilish/yopilish ishlamaydi; ochiqlik tugmasi qabulni boshqaradi. Aksiyalar saqlanadi, lekin server narxiga chegirma qo‘llanmaydi. Audit tarixi, backup/restore, ommaviy mijoz checkout va real pul hisobi keyingi bosqichga qoladi.

## Tuzilma

```text
src/App.tsx, styles.css        mavjud restoran/kuryer interfeysi
src/api.ts, usePlatform.ts     API, sessiya, polling, loading/error
src/Login.tsx                 haqiqiy login
src/data.ts, domain/           saqlangan lokal demo
server/src/                   Express, auth, RBAC, tenant API, provider kontraktlari
server/prisma/                12 domen modeli + Session, migratsiyalar, demo seed
server/tests/                 HTTP/domen va haqiqiy PostgreSQL testlari
tests/browser/                Chrome: backend UI (mock API) va eski demo regressiyasi
compose.yaml                  lokal PostgreSQL 17
.env.example, server/.env.example
docs/API.md, ARCHITECTURE.md, INTEGRATIONS.md, VERIFICATION.md
```
