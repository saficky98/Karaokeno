# Vdui 🎤 — караоке-вечірка

Webová karaoke aplikace pro párty v jedné místnosti. Hráči se střídají u jednoho
zařízení, zpívají na YouTube karaoke videa a aplikace přes mikrofon počítá
zábavné skóre (0–10 000) a vede žebříček. Rozhraní je v ukrajinštině.

**Živě:** https://karaokeno.vercel.app

## Funkce

- 🎬 Přehrávání YouTube karaoke videí (vyhledáváním i vložením odkazu)
- 🧑‍🤝‍🧑 2–8 hráčů s avatary, automatické střídání u mikrofonu
- 📋 Společná fronta písniček + osobní playlist každého hráče
- 🎙 Fun score z mikrofonu: čas zpěvu, stabilita tónu, energie —
  normalizované férově vůči hlasitosti daného hráče
- 🏆 Výsledky s vtipnými komentáři, konfetami a průběžným žebříčkem
- 🔤 Text písně s přepisem výslovnosti pro cizí písma (hebrejština, řečtina…)
- 💾 Vše se ukládá v prohlížeči — obnovení stránky o nic nepřipraví

Zvuk z mikrofonu se **nikam neposílá ani nenahrává** — analýza běží jen
v prohlížeči (Web Audio API).

## Spuštění pro vývojáře

```bash
npm install
cp .env.example .env   # a doplň svůj YouTube Data API v3 klíč
npm run dev
```

Bez klíče funguje vše kromě vyhledávání (písničky jde vkládat odkazem).
V nasazené aplikaci jde klíč aktivovat i za běhu: otevři
`https://<adresa-appky>/#k=TVŮJ_KLÍČ` — uloží se do prohlížeče daného zařízení.

Klíč si v Google Cloud Console omez na doménu aplikace a jen na
**YouTube Data API v3**.

## Tech stack

React + Vite, Tailwind CSS, YouTube IFrame Player API, YouTube Data API v3,
Web Audio API. Texty písní: primárně titulky přímo z hraného videa
(serverless funkce `api/captions.js` — časování sedí na milisekundy
k danému videu), záložně [LRCLIB](https://lrclib.net). Nasazeno na Vercelu.
