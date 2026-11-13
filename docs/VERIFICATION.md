# 2-bosqich tekshiruv natijalari

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
