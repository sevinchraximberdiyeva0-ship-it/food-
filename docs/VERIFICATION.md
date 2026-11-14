# 2-bosqich tekshiruv natijalari

## SUPER ADMIN uchun tayyorgarlik — 2026-11-14

- Mavjud `ADMIN` platforma SUPER ADMIN vakolati sifatida saqlandi. Oddiy rol ko‘tarish endpointi yo‘q.
- `202611140001_admin_bootstrap` additive migratsiyasi muvaffaqiyatli qo‘llandi. Eski 13 model saqlangan, PlatformBootstrap metadata bilan jami 14 model. Migratsiya hech qanday foydalanuvchi yaratmaydi.
- 28 ta domen/bootstrap/rol/xavfsizlik testi o‘tdi: 8 yangi bootstrap, 15 HTTP/security, 5 eski buyurtma domen testi. Bootstrap testlarida DB double ishlatilgan; haqiqiy administrator yaratish bajarilmagan.
- 9 ta brauzer regressiya testi o‘tdi; shundan 3 tasi yangi SUPER ADMIN restoransiz login/logout, oddiy rollarda admin paneli yo‘qligi, employee yaratish/deaktivatsiya ko‘rinishini tekshiradi. Ular mock API bilan ishlaydi.
- Haqiqiy frontend/API bilan mavjud 3 ta live brauzer testi o‘tdi. Ular noto‘g‘ri login va anonim ruxsatni tekshiradi, haqiqiy hisob yaratmaydi.
- `verify:api`: real PostgreSQL bilan 16 ta tekshiruv o‘tdi. Yangi admin account listing/deactivation/reactivation, sessiya bekor bo‘lishi, boshqa restoran hisobini o‘zgartira olmaslik va role maydoni rad etilishi faqat rollback qilinadigan demo fixturelarda sinovdan o‘tdi. Oldin/keyin users/restaurants/products/orders/couriers/sessions=0.
- `admin:verify`: haqiqiy PostgreSQL’da bir advisory lock egasi turganida boshqa ulanish uni ololmadi; bootstrap holati o‘zgarmadi. Bu helper yaratish funksiyasini chaqirmaydi.
- TypeScript, frontend/backend production build, PowerShell sintaksisi tekshirildi.
- `admin:status`: available=true, adminExists=false, completed=false. **Haqiqiy SUPER ADMIN yaratilmagan; yaratish buyrug‘i ishga tushirilmagan.**
- Seed, reset, buyurtma yaratish/o‘zgartirish, GitHub push va sirlarni chiqarish bajarilmadi. Birinchi haqiqiy hisob yaratish va o‘sha hisob bilan login/logoutni tekshirish foydalanuvchi tasdig‘idan keyingi alohida qadam.

Ko‘rib chiqiladigan amallar: [ADMIN_BOOTSTRAP.md](ADMIN_BOOTSTRAP.md).

## Ishlayotgan platforma va xavfsiz API tekshiruvi — 2026-11-14

| Tekshiruv | Natija |
| --- | --- |
| Backend ishga tushirish | `npm.cmd run server:dev`; 127.0.0.1:3001 da ishlayapti |
| Frontend | Mavjud Vite 127.0.0.1:5173; `/` va `/courier` HTTP 200 |
| Bevosita backend `/api/v1/health` | 200, `status=ok`, `database=connected` |
| Frontend proxy `/api/v1/health` | 200, haqiqiy backend/PostgreSQL javobi |
| Anonim orders/products/restaurants/couriers/me/state | 401; ruxsat tekshiruvi ishlaydi |
| Haqiqiy Prisma/Express tekshiruvlari | 15/15 o‘tdi; bitta majburiy rollback tranzaksiyasi |
| Haqiqiy frontend/API Chrome testlari | 3/3 o‘tdi; API mock qilinmagan |
| Mavjud brauzer regressiyasi | 6/6 o‘tdi; 4 mock API + 2 alohida lokal demo |
| Mavjud domen va HTTP xavfsizlik testlari | 17/17 o‘tdi; bu testlarda production DB ishlatilmaydi |
| Frontend/backend TypeScript va production build | O‘tdi |

`npm.cmd run verify:api` haqiqiy PostgreSQL ichida faqat **saqlanmaydigan** fixture foydalanuvchi/restoran/kategoriya/mahsulot/kuryer va sessiyalar bilan ishlaydi. Ismlar `ROLLBACK ONLY`, email `example.test`, yozuvlar bitta tashqi tranzaksiyada. IDs ochiq belgilangan, autoincrement ketma-ketligi ishlatilmaydi. Barcha yakun yo‘llarida tranzaksiya rollback qilinadi; commit va DELETE bajarilmaydi. Schema va migratsiyalar o‘zgarmagan.

Login, haqiqiy DB sessiyasi, HttpOnly cookie, uch rol, GET `/orders`, `/products`, `/restaurants`, `/couriers`, `/state`, restoran/kategoriyalar, pagination, boshqa restoranga 404, kuryerga menyu 403, admin restoran tanlashi tekshirildi. Menyu/restoran PATCH va kuryer availability POST natijasi shu tranzaksiyada bazadan qayta o‘qildi. Logout sessiyani bekor qilishi tekshirildi. Bu tekshiruvda Express factory tashqi rollback tranzaksiyasi bilan ishlaydi: production serverning Serializable parallel tranzaksiyalari yoki real buyurtma oqimini to‘liq end-to-end tasdiqlamaydi.

**Buyurtma yaratilmagan yoki o‘zgartirilmagan.** Order POST faqat noto‘g‘ri ma’lumot bilan 400; transitions/delivery/accept faqat oldindan yo‘qligi tekshirilgan ID bilan 404. Order/OrderItem/Delivery fixturelari ham yaratilmagan. Qabul qilish/yetkazishning muvaffaqiyatli biznes oqimi bu bazada ishga tushirilmagan.

Saqlangan yozuvlar soni tekshiruvdan oldin/keyin bir xil: users=0, restaurants=0, products=0, orders=0, couriers=0, sessions=0. Seed, reset, haqiqiy ma’lumotni o‘chirish yoki GitHub push bajarilmadi. Maxfiy parollar/URL chiqarilmadi.

**Birinchi kirish cheklovi:** tekshiruv paytida bazada administrator ham, restoran ham yo‘q. Shu sababli oddiy brauzerda muvaffaqiyatli login/panel ko‘rinishi uchun avval foydalanuvchi o‘z administrator hisobini yaratishi, keyin restoran va ishchi hisoblarni sozlashi kerak. Test hisoblari saqlanmaydi va login uchun ishlatilmaydi. Alohida `*_test` bazaga mo‘ljallangan mavjud biznes-integratsiya suite demo bazada bajarilmadi.

Qayta tekshirish:

```powershell
npm.cmd run db:check
npm.cmd run verify:api
npm.cmd run test:live
npm.cmd run test:browser
npm.cmd run typecheck
npm.cmd run build:all
```

`test:live` dan oldin backend 3001 va frontend 5173 portlarida ishga tushgan bo‘lishi kerak. Bu 3 test haqiqiy login sahifalari, mavjud bo‘lmagan hisobning 401 bilan rad etilishi va anonim resurs himoyasini tekshiradi; hisob/buyurtma yaratmaydi.

## PostgreSQL ulanishi — 2026-11-14

- PostgreSQL 18.7, `127.0.0.1:5432`, `tezkor_demo`, `postgres` bilan haqiqiy Prisma ulanishi muvaffaqiyatli.
- Parol alohida mahalliy PowerShell oynasida `Read-Host -AsSecureString` orqali kiritildi; URL maxsus belgilari encode qilinib, Git’dan chiqarilgan `server/.env` ga saqlandi. Parol/URL chatga yoki hisobotga chiqarilmadi.
- `prisma validate`, `generate`, `migrate deploy`, `migrate status` muvaffaqiyatli. `202611130001_phase2` va `202611130002_constraints` qo‘llangan, rollback qilinmagan.
- 13 model jadvali va `Delivery_one_active_per_courier` indeksi haqiqiy bazadan qayta tekshirildi; yetishmayotgan jadval/migratsiya yo‘q.
- `npm.cmd run db:check` mustaqil takroriy tekshiruvi va frontend/backend TypeScript tekshiruvi o‘tdi.
- `schema.prisma` va migratsiya fayllari Git diff bo‘yicha o‘zgarmagan. Reset, db push, seed, ma’lumot o‘chirish yoki GitHub push bajarilmadi.
- Bu ulanish/sxema tekshiruvi. Oldingi haqiqiy PostgreSQL biznes-integratsiya testlari shu demo bazasida bajarilmadi; ular uchun alohida `*_test` baza kerak.

## Dastlabki tekshiruv — 2026-11-13

Sana: 2026-11-13. Windows, Node.js 26.13.1, npm 11.20.0. Frontend React/TypeScript/Vite saqlangan.

| Tekshiruv | Natija |
| --- | --- |
| Mavjud frontend domen testlari | 5/5 o‘tdi |
| Backend domen/xavfsizlik/HTTP testlari | 12/12 o‘tdi; HTTP testlar DB stub ishlatadi |
| Haqiqiy PostgreSQL test to‘plami | SKIPPED: TEST_DATABASE_URL belgilanmagan |
| Chrome brauzer testlari | 6/6 o‘tdi; 4 mock-API backend UI, 2 lokal demo regressiya |
| Frontend TypeScript | O‘tdi |
| Backend TypeScript | O‘tdi; seed va testlar ham tekshiriladi |
| Frontend production build | O‘tdi |
| Backend production build | O‘tdi |
| Prisma Client generate | O‘tdi, sxema validatsiya qilindi |
| SQL migratsiya generatsiyasi | O‘tdi; initial + CHECK/unique index migratsiyalari saqlangan |
| Frontend npm audit | 0 zaiflik |
| Backend npm audit | 0 zaiflik; Prisma config dependencies patched overrides ishlatadi |
| PostgreSQL migrate deploy | Bajarilmadi: P1001, 127.0.0.1:5432 da baza yo‘q |
| Demo DB seed | Bajarilmadi: PostgreSQL mavjud emas |
| Docker Compose runtime | Tekshirilmadi: Docker o‘rnatilmagan/topilmadi |

Brauzer testlari login, API yo‘qligida ochiq xato, avtomatik demo fallback bo‘lmasligi, kuryer qabul/olib ketish/yakunlash so‘rovlari, muvaffaqiyatsiz menyu yozuvi UI’da saqlangandek ko‘rsatilmasligi, oldingi demo menyu/localStorage va mobil kuryer tanlagichini tekshiradi. Ular haqiqiy API+PostgreSQL end-to-end sinovi emas. Testlarda ixtiyoriy Google Fonts so‘rovlari bloklangan; tashqi shrift tarmoq kutishi mahalliy natijaga ta’sir qilmaydi.

Haqiqiy DB to‘plami alohida `*_test` bazada ishga tushirishga tayyor: login cookie, ikki tenant izolyatsiyasi, composite FK, narx snapshotlari, eski versiya 409, unclaimed mijoz ma’lumoti yashirilishi, ikki kuryerning bitta buyurtmani parallel olishi, ikki buyurtmaning bitta kuryerni parallel band qilishi, faqat biriktirilgan kuryerning status yangilashi, yakun/bekor qilishda kuryer bo‘shashi, logout va inactive account. PostgreSQL ishga tushmaguncha ushbu holatlar real bazada tasdiqlangan deb aytilmaydi.

Qayta bajarish va baza tayyorlash buyruqlari [README](../README.md) da. Production deploy bajarilmadi; to‘lov, GPS va tashqi provayderlar ulanmagan.
