# Taskboard

Takımlar için görev ve proje yönetim uygulaması. Çalışma alanları, rollü üyelik, projeler, görevler ve yorumlar; REST API'si Node.js, Express ve PostgreSQL ile yazıldı.

![CI](https://github.com/pietro379/taskboard/actions/workflows/ci.yml/badge.svg)

> **Durum:** API tamamlandı ve testlerle doğrulandı. React arayüzü ve canlı yayın yol haritasında.

## Özellikler

- E-posta ve şifre ile kayıt/giriş (JWT, bcrypt ile hash'lenmiş şifreler)
- Çalışma alanları: birden fazla takım, her biri kendi üyeleri ve projeleriyle
- Roller: **yönetici** (üye ve proje yönetimi) ve **üye** (görevlerle çalışır)
- Projeler ve görevler: durum (`todo`, `in_progress`, `done`), öncelik, atanan kişi, son tarih
- Görev listesinde durum/atanan filtresi, başlıkta arama ve sayfalama
- Görevlere yorum yazma
- Çalışma alanı etkinlik geçmişi (kim, ne zaman, ne yaptı)

## Tasarım kararları

- **Yetkilendirme sunucuda ve her uçta uygulanır.** Her istek, kullanıcının ilgili çalışma alanındaki üyeliğiyle birlikte tek sorguda çözülür. Üye olmayanlar için kaynak "yok" gibi davranır (403 yerine 404), böylece kimlik tahmin edilerek veri varlığı öğrenilemez.
- **Doğrulama tek yerde:** girdiler [zod](https://zod.dev) şemalarıyla kontrol edilir, hatalar tek biçimde döner. Güncelleme şemalarında varsayılan değer yoktur; gönderilmeyen alanlar sıfırlanmaz.
- **SQL enjeksiyonuna karşı** tüm sorgular parametrelidir. Dinamik `UPDATE` sütunları sabit bir izin listesinden gelir, `ILIKE` aramasında `%` ve `_` karakterleri kaçırılır.
- **Veri bütünlüğü** veritabanında da korunur: yabancı anahtarlar, `CHECK` kısıtları, sorgu desenlerine göre indeksler. Üye çıkarmak, görev atamalarını aynı işlem (transaction) içinde temizler.
- **Güvenlik katmanları:** `helmet`, CORS kısıtı, kimlik uçlarında hız sınırı, istek gövdesi boyut sınırı, giriş hatasında tek tip mesaj.
- **Test edilebilir yapı:** uygulama `createApp({ users, db })` ile bağımlılıklarını dışarıdan alır.

## API özeti

Kimlik gerektirmeyenler dışındaki tüm uçlar `Authorization: Bearer <token>` başlığı ister.

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| POST | `/api/auth/register` · `/api/auth/login` | Kayıt ve giriş, token döner |
| GET | `/api/auth/me` | Oturumdaki kullanıcı |
| POST · GET | `/api/workspaces` | Çalışma alanı oluştur / listele |
| GET | `/api/workspaces/:id` | Alan ve üyeleri |
| POST | `/api/workspaces/:id/members` | Üye ekle (yönetici) |
| PATCH · DELETE | `/api/workspaces/:id/members/:userId` | Rol değiştir / üyeyi çıkar (yönetici) |
| GET | `/api/workspaces/:id/activity` | Etkinlik geçmişi |
| POST · GET | `/api/workspaces/:id/projects` | Proje oluştur / listele |
| GET · PATCH · DELETE | `/api/projects/:id` | Proje detayı / güncelle / sil (yönetici) |
| POST · GET | `/api/projects/:id/tasks` | Görev oluştur / listele (`status`, `assigneeId`, `q`, `limit`, `offset`) |
| GET · PATCH · DELETE | `/api/tasks/:id` | Görev detayı / güncelle / sil (yönetici veya oluşturan) |
| POST · GET | `/api/tasks/:id/comments` | Yorum yaz / listele |

## Kurulum

Gereksinimler: Node.js 20+ ve bir PostgreSQL veritabanı ([Neon](https://neon.tech) ücretsiz planı yeterli).

```bash
git clone https://github.com/pietro379/taskboard.git
cd taskboard/server
npm install
cp .env.example .env     # DATABASE_URL ve JWT_SECRET değerlerini doldurun
npm run migrate          # tabloları oluşturur
npm run dev              # http://localhost:3000
```

## Testler

```bash
cd server
npm test
```

Kimlik doğrulama testleri bellekte çalışır. Çalışma alanı, proje ve görev testleri ise gerçek SQL'i ve yetki kurallarını geçici bir veritabanı şemasında dener; `DATABASE_URL` tanımlı değilse bu testler atlanır. GitHub Actions her push'ta PostgreSQL servisiyle tüm testleri çalıştırır.

## Proje yapısı

```
.
├── .github/workflows/ci.yml   Test hattı
└── server/
    ├── migrations/            SQL şema dosyaları
    ├── src/
    │   ├── app.js             Express uygulaması (bağımlılıklar dışarıdan)
    │   ├── server.js          Giriş noktası
    │   ├── migrate.js         Migration çalıştırıcı
    │   ├── middleware/        Kimlik, yetki ve hata yönetimi
    │   ├── routes/            auth, workspaces, projects, tasks
    │   └── lib/               Transaction ve etkinlik kaydı yardımcıları
    └── tests/                 Vitest + Supertest
```

## Yol haritası

- [ ] React arayüzü: giriş, çalışma alanları, sürükle-bırak görev panosu
- [ ] Canlı yayın (API ve arayüz)
- [ ] Görev etiketleri ve dosya ekleri
