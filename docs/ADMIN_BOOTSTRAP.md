# Birinchi SUPER ADMIN — bajarishdan oldingi ko‘rib chiqish

## Holat va rol

Schema’dagi mavjud `ADMIN` roli platforma bo‘ylab ishlaydi. Shu rol SUPER ADMIN vakolatini beradi; interfeysda `SUPER ADMIN` yoziladi, DB va API qiymati **ADMIN** bo‘lib qoladi. Mavjud rollar yoki hisoblar ko‘chirilmaydi. EMPLOYEE faqat o‘z restoranida, COURIER faqat o‘z topshiriqlarida ishlaydi.

`PlatformBootstrap` — faqat bir martalik bootstrap yakunlanganini saqlovchi yangi metadata modeli. `202611140001_admin_bootstrap` additive migratsiyasi qo‘llandi; unda hisob yaratish, rol berish, UPDATE yoki DELETE yo‘q. Dastlabki 13 model saqlangan, metadata bilan jami 14 model. Oldingi ikkita migratsiya o‘zgartirilmadi.

**Haqiqiy administrator hozircha yaratilmagan.** Hisob yaratish uchun loyiha egasining alohida tasdig‘i talab etiladi. Quyidagi yaratish buyrug‘i tekshiruvlar davomida ishga tushirilmadi.

## Tasdiqdan keyin bajariladigan amallar

1. Lokal PowerShell’da bootstrap ishga tushiriladi; avval read-only holat tekshiriladi.
2. `CREATE FIRST ADMIN` tasdiqlash matni, administrator emaili va ko‘rinadigan ismi lokal terminalda kiritiladi. Parol ikki marta `Read-Host -AsSecureString` bilan yashirin kiritiladi. Email/parol chatda so‘ralmaydi.
3. Ma’lumotlar Node yordamchisiga private stdin orqali uzatiladi. Parol CLI argumenti, muhit o‘zgaruvchisi, `.env`, vaqtinchalik fayl yoki logga yozilmaydi. Noto‘g‘ri input qiymatlari xatoda chiqarilmaydi.
4. Mavjud scrypt + tasodifiy salt mexanizmi parol xeshini tayyorlaydi. Email kichik harfga o‘tkaziladi, ism/email va 12–200 belgili parol Zod orqali tekshiriladi.
5. Bitta READ COMMITTED tranzaksiyasida `pg_advisory_xact_lock(1865301, 1)` olinadi. Mavjud har qanday ADMIN (hatto inactive/demo) yoki bootstrap belgisi bo‘lsa, jarayon to‘xtaydi.
6. Aks holda bitta `role=ADMIN`, `active=true`, `isDemo=false` hisob va `first-platform-admin` singleton belgisi atomar yaratiladi. Hisob va belgidan biri yozilmasa, ikkalasi ham rollback qilinadi.
7. Brauzerda login, `/me`, SUPER ADMIN paneli va logout tekshiriladi. Parol yoki cookie qiymati chatga chiqarilmaydi. Restoran/buyurtma/ishchi hisoblar avtomatik yaratilmaydi.

Faqat loyiha egasi tasdiqlaganidan keyin:

```powershell
npm.cmd run admin:bootstrap
```

Yoki Windows terminalida to‘g‘ridan-to‘g‘ri:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1
```

Eski `npm.cmd run admin:create --prefix server` ham aynan shu himoyalangan terminal yo‘liga yo‘naltirilgan. `ADMIN_EMAIL`, `ADMIN_PASSWORD` muhit qiymatlari orqali hisob yaratish eski usuli olib tashlangan. HTTP bootstrap, ommaviy registration va admin rolini beruvchi API yo‘q.

## Takroriy ishga tushirish va tiklash

Doimiy singleton belgi hisobga FK bilan bog‘lanmagan: hisob keyinchalik o‘chirilsa ham belgi yo‘qolmaydi va bootstrap ochilmaydi. Inactive ADMIN ham qayta bootstrap qilishga ruxsat bermaydi. Parallel ikki urinish bir xil advisory lock va singleton PK orqali himoyalangan. Mavjud email boshqa xodimga tegishli bo‘lsa, hisob qayta yozilmaydi yoki ko‘tarilmaydi. Metadata/account bir tranzaksiyada yoziladi.

Parolni tiklash yoki adminni almashtirish alohida, tasdiqlanadigan recovery vazifasi. Marker o‘chirish, DB reset yoki seed orqali bootstrapni ochish kerak emas. Demo seed ham ushbu qulfni oladi va haqiqiy ADMIN yoki bootstrap belgisi mavjud bo‘lsa ishlashni rad etadi. Seed bu vazifada umuman ishga tushirilmadi.

## Admin paneli va ruxsatlar

Login’dan keyin ADMIN restoran mavjud bo‘lmasa ham `Platforma boshqaruvi` sahifasiga kiradi. U restoran yaratadi, restoran panelini ochib sozlamalarni tahrirlaydi, xodim/kuryer hisoblarini yaratadi, ro‘yxatini ko‘radi va faollikni boshqaradi. Faol yetkazib berishdagi kuryerni to‘xtatish 409. Hisob to‘xtatilganda uning sessiyalari bekor qilinadi. Bu paneldan boshqa ADMIN yaratish yoki foydalanuvchi rolini ko‘tarish mumkin emas.

`GET /restaurants/:id/accounts` va `PATCH /restaurants/:id/accounts/:userId` faqat ADMIN uchun. PATCH faqat `{active:boolean}` qabul qiladi; role/passwordHash/isDemo kabi maydonlar rad etiladi. Faqat shu restoranga bog‘langan EMPLOYEE/COURIER boshqariladi; ADMIN hisobi bu yo‘lga kirmaydi. Xodim/kuryer yaratish endpointi rolni serverda qat’iy belgilaydi.

Keyinchalik yaratiladigan xodim/kuryerning boshlang‘ich paroli admin panelidagi alohida forma orqali yuboriladi va urinishdan keyin maydon tozalanadi. Bu birinchi SUPER ADMIN parolini terminal orqali kiritish talabini o‘zgartirmaydi. O‘z-o‘ziga parol almashtirish va taklif havolalari hozircha yo‘q.

## Sirlarni kiritmasdan tekshirish

2026-11-14 davom ettirish holati: haqiqiy SUPER ADMIN hali yaratilmagan. Lokal tasdiqlash matni kiritilmagani sababli yaratish urinishlari hisob yozishdan oldin bekor qilingan. Keyingi safar backend/frontendni ishga tushirib, `npm.cmd run admin:status` bilan holatni tekshiring, so‘ng loyiha egasi davom ettirishni tasdiqlaganda `npm.cmd run admin:bootstrap` bajaring. Birinchi savolga aynan `CREATE FIRST ADMIN`, undan keyin email, ism va yashirin parol kiritiladi. Sirlar chatga yuborilmaydi.

Yaratilgach lokal yordamchi saqlanmagan brauzer sessiyasida haqiqiy login, SUPER ADMIN paneli va logoutni tekshiradi; trace/screenshot/video yoki parol fayli yaratilmaydi. Natija faqat maxfiy bo‘lmagan boolean maydonlari bilan Git’dan chiqarilgan `server/.admin-bootstrap-result.json` da saqlanadi. Hisob yaratilgan, lekin tekshiruv tugamagan bo‘lsa bootstrapni qayta yaratish o‘rniga `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1 -VerifyOnly` orqali faqat tekshiruvni takrorlash mumkin.

```powershell
npm.cmd run admin:status
npm.cmd run admin:verify --prefix server
npm.cmd run typecheck
npm.cmd run build:all
npm.cmd run test:browser
```

`admin:status` faqat mavjudlik holatini qaytaradi; email, xesh va parolni chiqarmaydi. `admin:verify` haqiqiy PostgreSQL’da advisory lockning boshqa ulanishni bloklashini va holat o‘zgarmaganini tekshiradi; hisob yaratish funksiyasini chaqirmaydi.

Avtomatik testlar: bootstrap xeshlash, qayta/parallel urinish, nofaol admin, hisob yo‘qolgandan keyingi marker, xatoda rollback, email bandligi, input orqali rol ko‘tarish, endpoint RBAC va restoransiz admin paneli/login/logout. Unit/bootstrap va browser testlari test double/mocked API bilan ishlaydi. `verify:api` real PostgreSQL’da faqat rollback qilinadigan demo fixture hisoblarida login/logout va account managementni tekshiradi; haqiqiy admin saqlamaydi. Haqiqiy birinchi hisob login testi tasdiq va yaratishdan keyin bajariladi.
