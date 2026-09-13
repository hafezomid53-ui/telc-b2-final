# راهنمای کامل استقرار — از صفر تا صد (نسخه‌ی نهایی)

این راهنما جایگزین همه‌ی راهنماهای قبلیه. همه‌چیز از اول، یک‌جا.

## قدم ۱: پاک کردن ریپازیتوری‌های قدیمی (اختیاری ولی پیشنهادی)

اگه چند ریپازیتوری قبلی روی گیت‌هابت ساختی و می‌خوای تمیز شروع کنی:
1. برو به هرکدوم، **Settings** → پایین صفحه **Danger Zone** → **Delete this repository**
2. اسمش رو تایپ کن تا تأیید بشه

## قدم ۲: ساخت یک ریپازیتوری تازه

1. `github.com` → دکمه‌ی **+** بالا → **New repository**
2. اسمش رو بذار مثلاً `telc-b2-platform-final`
3. **Create repository**

## قدم ۳: آپلود فایل‌ها (ترتیب مهمه)

فایل zip رو که پیوست کردم دانلود و اکسترکت کن. ساختارش:
```
netlify.toml
DEPLOYMENT_README.md
test_backend.js
site/
    index.html
netlify/
    functions/
        _lib/
            auth.js
            paypal.js
        _data/
            all-exams-public.json
            all-exams-private.json
            exam-catalog.json
        exam.js
        exam-catalog.js
        exam-answers.js
        submit-exam.js
        audio.js
        correct-writing.js
        create-paypal-order.js
        capture-paypal-order.js
migrate/
    extract_exams.js   (فقط مرجع، برای دیپلوی لازم نیست)
```

توی صفحه‌ی ریپازیتوری خالی‌ت:
1. **"uploading an existing file"** رو بزن
2. اول فقط ۳ فایل تکی رو بکش: `netlify.toml`, `DEPLOYMENT_README.md`, `test_backend.js` → **Commit changes**
3. برو تو پوشه‌ی اکسترکت‌شده، پوشه‌ی `site` رو کامل بکش و رها کن → **Commit changes**
4. همون‌طور پوشه‌ی `netlify` رو کامل بکش و رها کن (کمتر از ۲۰ فایله، مرورگرت باید بتونه) → **Commit changes**
5. اختیاری: پوشه‌ی `migrate` رو هم بکش (فقط مرجع)

**چک نهایی:** برگرد به صفحه‌ی اصلی ریپازیتوری و مطمئن شو ساختار دقیقاً همینه که بالا نوشتم.

## قدم ۴: وصل کردن به Netlify

1. `app.netlify.com` → **Add new site** → **Import an existing project**
2. **Deploy with GitHub** → ریپازیتوری تازه‌ت رو انتخاب کن
3. تنظیمات build رو دست نزن (از `netlify.toml` می‌خونه) → **Deploy**

## قدم ۵: متغیرهای محیطی (Environment variables)

Site configuration → Environment variables → این ۵ تا رو اضافه کن:

| Key | Value |
|---|---|
| `ACCESS_TOKEN_SECRET` | یک رشته‌ی تصادفی ۳۰+ کاراکتری (خودت بساز) |
| `OPENAI_API_KEY` | کلید OpenAI‌ت (`sk-...`) |
| `PAYPAL_CLIENT_ID` | از developer.paypal.com → Apps & Credentials |
| `PAYPAL_CLIENT_SECRET` | همون‌جا |
| `PAYPAL_ENV` | `sandbox` (برای تست) بعداً `live` |

بعد از اضافه کردن همه‌شون: تب **Deploys** → **Trigger deploy** → **Deploy site**

## قدم ۶: تست کامل

- [ ] Lesen ۱، ۲، ۳ — متن‌ها و سؤالات درست نمایش داده بشن
- [ ] Sprachbausteine — سؤالات و جای‌خالی‌ها
- [ ] Hören ۱ — ۵ دکمه‌ی پخش جدا (اعلامیه‌های کوتاه)
- [ ] Hören ۲ — **یک** دکمه‌ی پخش کلی (مصاحبه)
- [ ] Hören ۳ — ۵ دکمه‌ی پخش جدا (نظرات افراد)
- [ ] Schreiben — دو موضوع قابل‌انتخاب + دکمه‌ی تصحیح AI
- [ ] دکمه‌ی پرداخت PayPal — با یک حساب Sandbox تستی (از developer.paypal.com → Sandbox → Accounts بساز)
- [ ] بعد از "پرداخت" تستی، آزمون‌های قفل باز بشن

## نکات امنیتی (خلاصه)

- تمام ۵۰ آزمون + جواب‌ها فقط سمت سرور، هرگز در frontend
- تصحیح نامه و صدا از طریق backend امن
- محافظت بازدارنده در برابر کپی (غیرفعال‌سازی انتخاب متن، واترمارک ردیابی خریدار)
- **مهم:** هیچ سیستمی (نه این، نه نتفلیکس، نه بانک‌ها) نمی‌تونه جلوی اسکرین‌شات سیستم‌عامل یا عکس گرفتن با گوشی رو کامل بگیره — این یک محدودیت فنی جهانیه

## اگه چیزی خراب شد

از این به بعد، فقط از همین یک ریپازیتوری و همین یک راهنما استفاده کن.
