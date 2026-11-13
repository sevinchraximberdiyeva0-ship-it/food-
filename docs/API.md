# FOOD / Tezkor Partner API — 2-bosqich

Koddagi amaldagi REST kontrakti. Prefix: `/api/v1`. Express + Prisma + PostgreSQL kerak; bu muhitda baza yo‘qligi sababli haqiqiy DB bilan bajarilishi hali tasdiqlanmagan. Birinchi bosqichdagi kelajak API jadvali ushbu amaldagi kontrakt bilan almashtirildi.

## Auth va javoblar

`POST /auth/login` tanasi: `{ "email": "hisob@example.test", "password": "<o‘zingiz belgilagan parol>" }`.

Har bir yozuvchi so‘rovda `Content-Type: application/json`, `X-Requested-With: TezkorPartner` yuboring. Brauzer `Origin` yuborsa, u `APP_ORIGIN` ga aynan mos bo‘lishi kerak. API CORS ochmaydi; frontend bilan bir origin orqali ishlaydi. Login ham ushbu tekshiruvdan o‘tadi. Cookie’ni yuborish uchun fetch `credentials: 'same-origin'` ishlatadi.

256-bit tasodifiy opaque sessiya tokeni HttpOnly, SameSite=Strict cookie’da; bazada faqat SHA-256 xeshi. Production’da `__Host-tezkor_session` va Secure, lokalda `tezkor_session`. Sessiya 8 soatdan keyin tugaydi; yangi login avvalgi shu brauzer sessiyasini bekor qiladi. Logout DB sessiyasini o‘chiradi. Refresh endpoint yo‘q; muddati tugaganda qayta login. Parol scrypt va har hisob uchun alohida tasodifiy salt bilan xeshlanadi. Rol va tenant har so‘rovda DB’dan olinadi.

Javob: `{ "data": ... }`. Ro‘yxat: `{ "data": [], "page": { "nextCursor": null } }` (faqat `/orders` va `/products`). Xato:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Buyurtma o‘zgargan. Ro‘yxatni yangilang.", "requestId": "..." } }
```

Zod xatosida `fields` qo‘shilishi mumkin. Stack, parol, token va ulanish sirlari javobga kiritilmaydi. `X-Request-ID` javob headerida, `Cache-Control: no-store`. Muvaffaqiyatli create: 201, boshqa amallar: 200.

| Status | Ma’no |
| --- | --- |
| 400 | VALIDATION_ERROR / INVALID_JSON |
| 401 | UNAUTHENTICATED / INVALID_CREDENTIALS |
| 403 | FORBIDDEN / CSRF_REJECTED / NO_RESTAURANT |
| 404 | NOT_FOUND, shu jumladan begona restoran resurslari |
| 409 | VERSION_CONFLICT / ASSIGNMENT_CONFLICT / CONFLICT / ACTIVE_DELIVERY |
| 413 | PAYLOAD_TOO_LARGE (64 KB limit) |
| 422 | INVALID_TRANSITION / PRODUCT_UNAVAILABLE / RESTAURANT_CLOSED / INVALID_REFERENCE / TOTAL_TOO_LARGE |
| 429 | RATE_LIMITED / LOGIN_RATE_LIMITED |
| 503 | DATABASE_UNAVAILABLE |

Login limit: IP uchun 20 so‘rov / 15 daqiqa; umumiy API: 300 / daqiqa. Limit xatolarida `requestId` bo‘lmasligi mumkin. Rate limit xotirada, ko‘p serverli deployment uchun umumiy store zarur. Backend bazaga boshlang‘ich ulanish bo‘lmasa portni ochmaydi va xato bilan tugaydi; Vite buni mavjud bo‘lmagan backend sifatida ko‘rsatadi.

## Rollar va tenant

- `ADMIN`: barcha restoranlar, yangi restoran va xodim/kuryer hisoblari yaratish.
- `EMPLOYEE`: faqat o‘z restoranidagi buyurtmalar, menyu va sozlamalar.
- `COURIER`: faqat o‘z topshiriqlari; o‘z restoranidagi biriktirilmagan READY buyurtmalarni qabul qilish. Qabul qilguncha mijoz ismi/manzili yashiriladi.

Xodim va kuryer uchun restoran identifikatori hisob bog‘lanishidan olinadi; URL/query bilan boshqa tenant tanlash 404. Admin `?restaurantId=...` bilan restoran tanlaydi; berilmasa birinchi restoran olinadi. Composite FK kategoriya/mahsulot/buyurtma/kuryer/yetkazib berish tenantini bazada ham tekshiradi. Foydalanuvchi tenant yoki rolini PATCH tanasi orqali almashtira olmaydi. Ommaviy ro‘yxatdan o‘tish yo‘q.

## Endpointlar

| Usul | Yo‘l | Ruxsat va vazifa |
| --- | --- | --- |
| GET | /health | Ochiq; SELECT 1 bilan bazani tekshiradi |
| POST | /auth/login | Ochiq; sessiya yaratish |
| POST | /auth/logout | Kirgan hisob; sessiyani bekor qilish |
| GET | /me | Profil: id, name, email, role, restaurantId, courierId, isDemo |
| GET | /state | Rolga mos UI snapshot; `?restaurantId` admin uchun |
| GET | /restaurants | Admin barcha (maks. 100); boshqalar faqat o‘z restorani |
| POST | /restaurants | Admin; `{name, phone, address, open?}` |
| GET | /restaurants/:id | Ruxsatli restoran |
| PATCH | /restaurants/:id | Admin/xodim; `{name?, phone?, address?, open?}` |
| GET | /restaurants/:id/categories | Admin/xodim; kategoriyalar |
| PUT | /restaurants/:id/working-hours | Admin/xodim; 7 kunlik to‘liq jadval |
| PATCH | /restaurants/:id/promotions/:promotionId | Admin/xodim; `{active: boolean}` |
| POST | /restaurants/:id/employees | Faqat admin; `{email,name,password}` |
| POST | /restaurants/:id/couriers | Faqat admin; `{email,name,password}` |
| GET | /products | Admin/xodim; cursor bilan katalog |
| POST | /products | Admin/xodim; `{name,price,category,emoji?,available?}` |
| PATCH | /products/:id | Admin/xodim; yuqoridagi maydonlar qisman |
| GET | /orders | Admin/xodim o‘z restoranini; kuryer o‘z topshiriqlarini |
| POST | /orders | Admin/xodim buyurtma yaratish; mijoz checkout emas |
| GET | /orders/:id | Ruxsatli buyurtma |
| POST | /orders/:id/transitions | Admin/xodim; tayyorlash yoki bekor qilish |
| POST | /orders/:id/delivery | Admin/xodim; ichki kuryer biriktirish |
| GET | /couriers | Admin/xodim; o‘z restorani, maks. 100 |
| GET | /courier/me/tasks | Faqat kuryer; o‘z faol topshiriqlari |
| POST | /courier/orders/:id/accept | Faqat kuryer; biriktirilmagan READY buyurtmani olish |
| POST | /courier/orders/:id/transitions | Biriktirilgan kuryer; olib ketish/yetkazish |
| POST | /courier/me/availability | Kuryer; `{available: boolean}`, faol yetkazish paytida 409 |

Hisob yaratish paroli 12–200 belgi. Email unique, kichik harfga o‘tkaziladi. Narxlar butun so‘m (UZS), 1000–10000000, miqdor 1–100, buyurtmada 1–50 element. Yangi restoranga yetti kunlik 09:00–23:00 boshlang‘ich jadvali yaratiladi; PUT bilan tahrirlanadi. Soat/promo endpointlari yozuvlarni saqlaydi, narxlash va avtomatik jadval schedulerini yoqmaydi. Promo va sharh yaratish hozircha ommaviy API orqali mavjud emas.

`GET /orders?limit=25&cursor=100&status=READY&restaurantId=1`: id kamayish tartibida, cursor’dan kichik id’lar. `GET /products?limit=25&cursor=5&restaurantId=1`: id oshish tartibida, cursor’dan katta id’lar. `limit`: 1–100. `nextCursor` qolgan sahifa bor bo‘lsa oxirgi qaytgan id, aks holda null. UI qidiruvi yuklangan snapshot ustida lokal ishlaydi.

## Buyurtma yaratish

```json
{
  "restaurantId": 1,
  "customer": "Mijoz ismi",
  "address": "Yetkazish manzili",
  "items": [{ "productId": 1, "quantity": 2 }]
}
```

Klient narx/jami yubormaydi; yuborsa validatsiya rad etadi. Server sotuvdagi shu restoranga tegishli mahsulotlarni olib jami hisoblaydi, nom/narx snapshotini OrderItem’da saqlaydi. Keyingi menyu tahriri eski summani o‘zgartirmaydi. Yopiq restoranda yaratish rad etiladi. Hozircha bu restoran operatori yaratadigan buyurtma; haqiqiy to‘lov talabi yo‘q.

## Status va versiya

```text
Xodim/admin: NEW → PREPARING → READY
Xodim/admin: NEW / PREPARING / READY → CANCELLED
Biriktirilgan kuryer: READY → DELIVERING → COMPLETED
```

Yangi buyurtma `version=1`. Har status va biriktirish versiyani oshiradi. Har amal joriy `expectedVersion` talab qiladi:

```http
POST /api/v1/orders/1/transitions
Content-Type: application/json
X-Requested-With: TezkorPartner
Cookie: tezkor_session=<login cookie>

{ "to": "PREPARING", "expectedVersion": 1 }
```

Biriktirish: `{ "courierId": 1, "expectedVersion": 2 }`.
Kuryer qabul qilishi: `{ "expectedVersion": 3 }`; courierId serverdagi sessiyadan olinadi.
Kuryer holati: `{ "to": "DELIVERING", "expectedVersion": 4 }`, keyin COMPLETED.

API Order DTO `id` ni UI mosligi uchun string qaytaradi; kuryer/mahsulot/restoran id’lari number. `serverStatus` yuqoridagi enum, UI `status` o‘zbekcha. PREPARING va READY bir xil `Tayyorlanmoqda` guruhida; kuryer READY’ni alohida `Tayyor` deb ko‘radi. DTO’da version, customer, initials, address, items (snapshot matni), total, time (Asia/Tashkent), delivery='internal', courierId?, isDemo mavjud.

Serializable tranzaksiya + shartli update + unique order delivery + faol kuryer uchun partial unique index parallel ikki biriktirishni bloklaydi. Serialization xatosi uch martagacha qayta sinab ko‘riladi, keyin 409. Bekor qilish/yakunlash delivery holati va kuryer bandligini atomar o‘zgartiradi. Xodim kuryer nomidan yetkazishni yakunlay olmaydi. Hozircha idempotency-key saqlash yoki qayta biriktirish API’si yo‘q; takroriy amal joriy versiya bilan 409 oladi, yangi parallel topshiriq yaratmaydi.

## UI snapshot

`/state`: restaurantId, restaurant, phone, open, isDemo, orders, menu, couriers, hours, promotions, reviews, employees, truncated. Eng ko‘pi 500 buyurtma, 100 sharh; `truncated` UI ogohlantirishini yoqadi. Kuryer snapshotida katalog/jadval/aksiya/sharh/xodimlar bo‘sh, kuryer ro‘yxatida faqat o‘zi. Buyurtmalar faqat uning faol topshiriqlari va shu restoranning biriktirilmagan READY takliflari. Snapshot RepeatableRead tranzaksiyada olinadi. UI 10 soniya polling, yozishdan keyin yangilash va qo‘lda retry ishlatadi.

Ish vaqti PUT tanasi: `[{weekday:0,start:"09:00",end:"23:00",enabled:true}, ...]`, 0=Dushanba, 6=Yakshanba; har kun bir martadan.

To‘lov, GPS, tashqi delivery/webhook, SSE, finance va analytics endpointlari **amalga oshirilmagan**. Oldingi reja ular ishlayotganini anglatmaydi. Kengaytirish: [INTEGRATIONS.md](INTEGRATIONS.md).
