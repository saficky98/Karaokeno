# Vdui 🎤 — караоке-вечірка

Webová karaoke aplikace pro párty v jedné místnosti. Hráči se střídají u jednoho
zařízení, zpívají na YouTube karaoke videa a aplikace přes mikrofon počítá
zábavné skóre (0–10 000) a vede žebříček. Rozhraní je v ukrajinštině.

**Živě:** https://karaokeno.vercel.app

## Funkce

- 🎬 Přehrávání YouTube videí (vyhledáváním i vložením odkazu)
- 🧑‍🤝‍🧑 2–8 hráčů s avatary, automatické střídání u mikrofonu
- 📋 Společná fronta písniček + osobní playlist každého hráče
- 🎙 Fun score z mikrofonu: čas zpěvu v řádcích textu, melodičnost,
  stabilita tónu, energie — normalizované férově vůči hlasitosti hráče;
  pískání a monotónní bzučení dostanou míň než skutečný zpěv
- 🏆 Výsledky s vtipnými komentáři, konfetami a průběžným žebříčkem
- 🔤 Synchronizovaný text písně a přepis výslovnosti pro cizí písma
  (hebrejština, arabština, řečtina, korejština, japonština — kanji čte
  server přes `/api/romanize`)
- 📺 Sdílená místnost přes jeden odkaz/QR: PC nebo TV se stane
  **obrazovkou** (video + text + živé skóre), hráči se přidají telefonem,
  vytvoří si postavu, přidají písničky a **zpívají do mikrofonu svého
  telefonu** — skóre se počítá v telefonu a šifrovaně letí do místnosti
- 💾 Vše se ukládá v prohlížeči — obnovení stránky o nic nepřipraví

Zvuk z mikrofonu se **nikam neposílá ani nenahrává** — analýza běží jen
v prohlížeči (Web Audio API); do místnosti se posílají jen čísla skóre.

## Spuštění pro vývojáře

```bash
npm install
npm run dev
```

Vyhledávání i titulky fungují přes lokální serverové cesty `/api/search` a
`/api/captions`, takže YouTube Data API klíč není nutný. Pokud ho chceš mít
jako zálohu, zkopíruj `.env.example` na `.env` a doplň `VITE_YOUTUBE_API_KEY`.
V nasazené aplikaci jde klíč aktivovat i za běhu: otevři
`https://<adresa-appky>/#k=TVŮJ_KLÍČ` — uloží se do prohlížeče daného zařízení.

Klíč si v Google Cloud Console omez na doménu aplikace a jen na
**YouTube Data API v3**.

## Spuštění mimo Vercel

```bash
npm install
npm run build
npm start
```

`npm start` spustí malý Node server, který obslouží sestavenou aplikaci ze
složky `dist/` i API cesty pro vyhledávání a titulky. Produkční odkaz běží na
Vercelu; tento postup je záloha pro vlastní server, Railway, Render, Fly.io,
DigitalOcean nebo jiný Node hosting. V produkci musí běžet přes HTTPS, jinak
prohlížeč nepovolí mikrofon.

## Tech stack

React + Vite, Tailwind CSS, YouTube IFrame Player API, YouTube Data API v3,
Web Audio API. Texty písní: titulky přímo z hraného videa přes `api/captions.js`
a synchronizované texty z [LRCLIB](https://lrclib.net). Produkční nasazení běží
na Vercelu.
