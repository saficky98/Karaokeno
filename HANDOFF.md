# Handoff: Karaokeno — dokončení karaoke aplikace

Tento dokument je určen pro navazujícího agenta (GPT Codex nebo kohokoliv
jiného), který pokračuje v práci na této appce. Píše se v okamžiku, kdy
předchozí agent (Claude) vyčerpal časový/tokenový limit uprostřed práce.
Cílem je předat **kompletní kontext**, aby nebylo nutné nic znovu objevovat.

## Zadání od majitele (doslovně, přeloženo z češtiny)

Majitel není programátor. Chce **jeden finální, perfektní výsledek**, bez
dalších dotazů. Explicitní tvrdé požadavky:

1. **Extrakce titulků** musí fungovat dobře, a to i když píseň nemá
   automaticky dostupné titulky — v tom případě je nutné texty získat
   "přes nějaký nástroj" (ASR/rozpoznávání řeči nebo jiný zdroj).
2. Text ke zpívání musí být **na sekundu přesně synchronizovaný** s
   písničkou.
3. **Nikde v aplikaci se nesmí překrývat ani duplikovat tlačítka.**
4. Musí se **počítat body za zpívání**.
5. Písničky v exotických jazycích/písmech (příklad: **hebrejština** —
   výslovně NE španělština, němčina, angličtina, ruština, ukrajinština,
   čeština, slovenština, polština, italština) musí mít **perfektní
   přepis výslovnosti** (transkripci do latinky), aby šlo zpívat i bez
   znalosti daného písma.
6. Ověřit, že je **opravdu všechno funkční** — a zvážit, jestli by
   architektura/nástroje neměly být jiné.
7. **Žádný Vercel** — majitel to výslovně odmítl. (Pozor: momentálně
   appka MÁ dvě serverless funkce v `api/`, které na Vercelu běžely.
   Řešení je popsané níže v sekci "Architektura a Vercel".)
8. Nakonec vše commitnout a pushnout na GitHub (bez dalších dotazů).

Majitel řekl doslova "s tím zápasím už den a ono hovno" — je frustrovaný
z předchozích iterací, takže cílem NENÍ přidávat další rozpracované věci,
ale **doopravdy domyslet a dotáhnout** to, co je rozjednané.

## Stav repozitáře

- **Repo**: `saficky98/Karaokeno` (GitHub)
- **Pracovní branch**: `claude/karaokeno-app-completion-118r8w` (už
  pushnutá, s otevřeným **draft PR #23** proti `main`)
- **PR**: https://github.com/saficky98/Karaokeno/pull/23 — CI (Vercel
  preview check) je zelené, žádné review komentáře. Je draft — až bude
  appka hotová dle zadání, přepni na "ready for review" nebo rovnou
  smerguj (podle toho, jaká práva/pokyny navazující agent dostane).
- Poslední commit shrnuje první vlnu oprav (viz `git log -1`).

### Tech stack

React 19 + Vite 6 + Tailwind 4, YouTube IFrame Player API (přehrávání),
YouTube Data API v3 (volitelný fallback pro vyhledávání), LRCLIB (veřejná
DB synchronizovaných textů písní, zdarma, bez klíče), Web Audio API
(analýza mikrofonu), volitelně MQTT (`mqtt` balíček) pro sdílené
"místnosti" mezi hostitelem a hosty. UI je v ukrajinštině/češtině
(přepínatelné, `src/lib/i18n.jsx`).

## Co už bylo v tomto sezení uděláno (a proč)

Proběhl rozsáhlý paralelní audit (7 nezávislých agentů, každý pokrýval
jednu dimenzi appky, s adversariální verifikací nálezů) proti bodům
1–8 výše. Zároveň proběhlo ruční procházení klíčových souborů a
Playwright smoke test simulující reálné používání (mock YouTube IFrame
API + mock LRCLIB, 3 šířky obrazovky: 375px telefon, 844×390 landscape,
1280px desktop) hledající pixelové překryvy tlačítek.

**Opravené věci (už v commitu, funkční, otestované):**

1. **`src/lib/lyrics.js` — `parseLrc`**: komprimované LRC řádky s VÍCE
   časovými značkami na jednom řádku (typicky refrén: `[01:10.00]
   [02:30.00]La la la`) se dřív rozbily — druhá závorka skončila jako
   viditelný text v titulcích. Teď se správně rozbalí na dva samostatné
   řádky se stejným textem. Pokryto testem `tests/lyrics.test.js`.
2. **`src/lib/scoring.js` — `ScoreEngine.update`**: adaptace hladiny
   pozadí (`noiseFloor`) byla nastavená tak, že při dlouhé sloce beze
   změny hlasitosti (typicky držený tón) hladina pozadí "dohnala"
   hlasitost zpěváka a body přestaly přibývat. Opraveno zpomalením
   nárůstu při detekovaném tónu + přidán strop odvozený od průměrné
   hlasitosti tohoto konkrétního zpěváka. Pokryto `tests/scoring.test.js`
   (5 scénářů: ticho nedává body, zpěv nad pozadím dává body, stabilní
   tón > kolísavý, celá píseň > půlka, skóre nikdy nepřeteče 10000).
3. **`api/search.js` (NOVÝ soubor)**: vyhledávání písniček na YouTube BEZ
   API klíče, přes stejný "InnerTube" mechanismus, jaký už `api/
   captions.js` používal pro titulky. `src/lib/youtubeApi.js` teď zkouší
   tuhle cestu jako první; YouTube Data API klíč zůstává jen jako
   záložní možnost (`SongPicker.jsx` ho nabídne, teprve když selžou obě
   bezklíčové cesty). **Tohle řeší reálný problém**: appka dřív bez
   ručně vloženého Google Cloud API klíče vyhledávání vůbec nezobrazila
   (`SongPicker` rovnou ukázal formulář na klíč) — takže "appka funguje
   hned po otevření" nebylo pravda. Pokryto `tests/search.test.js`.
4. **`vite.config.js`**: middleware, který zpřístupní `/api/captions` i
   `/api/search` i v `npm run dev` a `npm run preview` — ne jen po
   nasazení na Vercel. Bez tohohle appka v lokálním vývoji (a na
   jakémkoli ne-Vercel hostingu bez adaptace) neuměla stahovat titulky z
   videa ani vyhledávat bez klíče — LRCLIB fungoval, ale to je jen
   záložní zdroj.
5. **`src/screens/PlayScreen.jsx` + `src/components/LiveScoreHUD.jsx`**:
   Horní lišta hrací obrazovky byla poskládaná z NEZÁVISLÝCH `absolute`
   pozicovaných prvků (chip zpěváka vlevo nahoře, `LiveScoreHUD`
   vycentrovaný nahoře, shluk tlačítek mikrofon/přeskočit/zvuk/odejít
   vpravo nahoře, tlačítko "Zapnout zvuk" dole uprostřed) — audit
   potvrdil, že se na úzkých telefonech (≤ 640px) reálně překrývaly (viz
   `LiveScoreHUD` přes shluk tlačítek a chip zpěváka). Přestavěno na
   JEDEN flow kontejner (`flex flex-col`) nahoře, kde je pořadí:
   řádek [chip zpěváka | ovládací tlačítka] → živé skóre → tlačítko
   "Zapnout zvuk". Ve flow layoutu se prvky navzájem odstrkují místo
   překrývání, na libovolné šířce obrazovky.
6. `package.json`: přidán `vitest` jako dev dependency a `npm test`
   skript. `npm run build` i `npm test` (36 testů) procházejí čistě.

**Playwright ověření** (skript NENÍ v repu, běžel jen v tomto sezení ve
scratchpadu — pokud ho chceš znovu, kód je jednoduchý: mock `window.YT`
+ `page.route` na LRCLIB, projet všechny obrazovky, hit-testovat
tlačítka přes `elementFromPoint` s ořezáním o scroll/clip předky): po
opravě č. 5 nenašel žádné pixelové překryvy tlačítek v hlavních stavech
na žádné ze 3 šířek. **Nicméně** — viz níže — audit našel jeden
duplicitní-akce problém, který Playwright test (kontroluje jen
geometrii, ne sémantiku) nezachytil a který **zůstal neopravený**.

## Co NENÍ opravené — prioritizovaný seznam pro navazujícího agenta

Řazeno podle důležitosti vůči explicitním požadavkům majitele výše.

### 🔴 Kritické (blokují splnění tvrdého požadavku)

**A. Duplicitní tlačítko "zapnout zvuk" (požadavek č. 3 — žádné duplicity)**

Soubor: `src/screens/PlayScreen.jsx`. Když autoplay se zvukem selže
(hlavně iPhone/Safari), appka nastaví `needsUnmute = true` a `soundOn =
false` (`ensurePlaying`, cca řádek 289–306). V tu chvíli jsou SOUČASNĚ
viditelná DVĚ tlačítka, která dělají přesně totéž (zapnout zvuk):
- horní lišta: tlačítko zvuku v "ztlumeném" červeném stavu (`toggleSound`,
  ikona `VolumeX`)
- velké CTA "Увімкнути звук"/"Zapnout zvuk" uprostřed pod živým skóre

Návrh opravy: když `needsUnmute` je `true`, nerenderuj horní tlačítko
zvuku vůbec (je jednoznačné, co má uživatel udělat — klikni na velké
CTA). Jakmile se odmutuje, `needsUnmute` padne na `false` a horní
tlačítko se vrátí. Je to pár řádků v podmínce kolem tlačítka zvuku v
horní liště (hledej `onClick={toggleSound}` v `PlayScreen.jsx`).

**B. `ScoreEngine` skoro vždy dostane výchozí 180s délku písně místo
skutečné (požadavek č. 4 — počítání bodů)**

Soubor: `src/screens/PlayScreen.jsx`, funkce `startScoring` (řádek
~201–206) volaná z `onReady` callbacku YouTube přehrávače (řádek
313–318):

```js
async function startScoring() {
  if (micConsent !== 'on') return
  const duration = playerApiRef.current?.getDuration?.() || 180
  engineRef.current = new ScoreEngine(duration)
  await runAnalysis()
}
```

`playerApi.getDuration()` v `onReady` callbacku u YouTube IFrame API
velmi často vrátí `0` (metadata ještě nejsou plně načtená), takže
`|| 180` fallback naskočí prakticky pokaždé. `ScoreEngine` pak počítá
skóre vůči 180 sekundám bez ohledu na to, jestli píseň trvá 2 minuty
nebo 6 minut — u delší písně skóre nespravedlivě nasytí strop dřív, u
kratší nikdy nedosáhne plného potenciálu. Tohle přímo poškozuje
korektnost bodování, což je explicitní požadavek majitele.

Návrh opravy: nevytvářet `ScoreEngine` hned v `onReady`, ale počkat, až
`getDuration()` vrátí rozumnou hodnotu (poll s `setTimeout`, podobně
jako `ensurePlaying` nebo `LyricsPanel`'s `discover` funkce to už dělají
jinde v kódu — vzor zkopírovat), NEBO dopočítat/přenastavit `duration`
na `ScoreEngine` instanci, jakmile je známá (přidat `setDuration()`
metodu do `ScoreEngine` a zavolat ji z `onProgress`/countdown handleru,
až `getDuration()` vrátí > 0).

**C. Přepis výslovnosti pro exotická písma není "perfektní" (požadavek
č. 5)** — `src/lib/romanize.js`

Toto je pravděpodobně **nejvíc práce** ze všeho, a je to explicitně
pojmenovaný požadavek (majitel dal hebrejštinu jako konkrétní příklad).
Audit potvrdil:

- **Hebrejština** (vlastní implementace v souboru, řádky ~20–121):
  heuristika vkládání "a" do shluků souhlásek dává správný výsledek pro
  slova v ručním slovníku `HEB_COMMON` (~30 slov), ale mimo slovník
  produkuje pro spoustu běžných slov v písňových textech špatný nebo
  nezpívatelný přepis. Slovník je potřeba výrazně rozšířit (stovky
  nejčastějších slov v hebrejských písních), NEBO nasadit lepší
  fonetický přístup (kontextová pravidla pro begadkefat, matres
  lectionis, apod. — základ už v kódu je, jen neúplný).
- **Arabština**: text bez diakritiky (stejný problém jako hebrejština —
  písně se píšou bez samohláskových značek), ale ŽÁDNÉ speciální
  zacházení — spadá do obecné větve `transliterate()` z knihovny
  `transliteration`, která u arabštiny bez vokalizace dává nezpívatelné
  shluky souhlásek. **Doporučení**: napsat analogickou funkci k
  `hebrewToLatin` pro arabštinu (stejná technika — vkládání samohlásky
  do shluků + slovník nejčastějších krátkých slov + zvláštní zacházení
  s ا/و/ي jako matres lectionis, podobně jako א/ו/י v hebrejštině).
- **Japonština s kanji**: knihovna `transliteration` neumí japonštinu
  rozlišit od čínštiny — kanji se přečte jako ČÍNSKÝ pinyin, což dává
  vyloženě ŠPATNOU výslovnost pro japonskou píseň (kanji se v japonštině
  čte úplně jinak než v čínštině). Toto je zavádějící hůř než žádný
  přepis. **Doporučení**: buď (a) detekovat japonštinu podle přítomnosti
  hiragany/katakany ve stejném textu jako kanji (japonské texty téměř
  vždy kombinují všechny tři systémy, čistě čínský text kana neobsahuje)
  a pro čistou kanu udělat přímý přepis (hiragana/katakana → rómadži je
  triviální 1:1 mapování, žádná knihovna není potřeba, jde napsat
  vlastní tabulku jako u hebrejštiny), a pro kanji v japonském kontextu
  buď zobrazit "furigana" čtení (vyžaduje morfologický analyzátor typu
  `kuromoji` — těžké na klientský bundle, ale appka už má vzor
  serverless funkce v `api/`, takže by se dal přidat `api/furigana.js`
  volaný jen pro japonské řádky), nebo transparentně přiznat, že se u
  kanji přepis nedělá (lepší než tiše ukázat špatnou čínštinu).
- **Devanagari (hindština)**: ztrácí se "schwa deletion" pravidlo
  (v hindštině/pár dalších jazycích psaných devanagarí se koncová
  vnitřní "a" v psaném písmu často NEVYSLOVUJE) — přepis pak zní
  nepřirozeně. Je to známý, dobře zdokumentovaný algoritmus (schwa
  deletion rules), dal by se doplnit jako další vlastní funkce vedle
  hebrejštiny.
- **Menší nedostatky**: `FOREIGN_SCRIPTS` regex (řádek 6–7) nepokrývá
  tamilštinu, bengálštinu, telugu a několik dalších písem — ty texty
  vůbec nedostanou přepis (tichý fail, ne špatný výsledek, ale pořád
  nesplňuje požadavek). Řecké "ου" vychází jako "oy" místo "u". Sin/shin
  tečky (hebrejská diakritika, když výjimečně je přítomná) se zahazují.

**Realistický plán pro tuhle sekci**: vzhledem k rozsahu doporučuji
udělat pořádně JEN hebrejštinu (rozšířit slovník + doladit pravidla —
je to explicitně žádaný příklad od majitele) a arabštinu (stejná
technika, nejbližší k hebrejštině), u zbytku (japonské kanji,
devanagari, thajština) aspoň přiznat limitaci v UI (např. neukazovat
"transkripci", která je prokazatelně špatná — lepší žádná než špatná)
a nechat je na další iteraci, pokud majitel časem přijde s konkrétní
písní v daném jazyce.

### 🟠 Důležité (reálné, ale ne blokující "tvrdé" požadavky)

**D. Architektura a "žádný Vercel" (požadavek č. 7)**

Appka teď má DVĚ serverless funkce (`api/captions.js`, `api/search.js`),
které vyžadují nějaké prostředí schopné spouštět Node/serverless
handlery (request → response), ne jen statický hosting. Přidal jsem
Vite middleware, takže `npm run dev` a `npm run preview` je servírují
lokálně — ale to nic neřeší pro PRODUKČNÍ nasazení, protože `vite
preview` se v praxi nepoužívá jako produkční server.

**Majitel řekl "žádný Vercel", ne "žádný server"** — je potřeba zvolit
alternativu. Doporučení (seřazeno podle jednoduchosti pro
ne-programátora):

1. **Nejjednodušší a nejrobustnější**: napsat malý samostatný Node
   server (`server.js` v rootu, pomocí `http` nebo `express`), který (a)
   servíruje staticky vybuildovaný `dist/` adresář, (b) mountuje stejné
   handlery z `api/captions.js` a `api/search.js` na `/api/*` cesty
   (kód handlerů je framework-agnostický, jen čeká na `req`/`res` — dá
   se použít prakticky beze změny, stejně jako v `vite.config.js`
   middlewaru, který už to dělá). Appka se pak spustí PŘÍKAZEM `npm run
   build && node server.js` na JAKÉMKOLI stroji s Node.js — vlastní
   VPS, Raspberry Pi doma, Railway, Render, Fly.io, DigitalOcean
   App Platform, nebo i jen `pm2` na libovolném linux serveru. Žádný
   vendor lock-in, žádný Vercel.
2. Alternativa: Cloudflare Workers / Pages Functions — taky zdarma,
   taky žádný Vercel, ale vyžaduje trochu jinou syntaxi handlerů
   (Cloudflare Workers API místo Node http), tedy víc přepisování.
3. Netlify Functions — velmi podobné Vercelu (skoro copy-paste), ale
   pořád je to "nějaký cloud provider", ne úplná nezávislost.

Doporučuji možnost 1 — je to nejmíň překvapivé, nejvíc přenositelné, a
"jeden příkaz ať to rozjede kdekoli" odpovídá tomu, že majitel není
programátor a bude appku pravděpodobně hostit tam, kam mu poradí
kamarád/hosting, který zrovna má.

**Nezapomeň smazat/upravit zmínky o Vercelu v `README.md`** (live odkaz
`karaokeno.vercel.app`, věta "Nasazeno na Vercelu") — momentálně tam
pořád je a bude matoucí, pokud appka poběží jinde.

**E. Lyrics pipeline — zbylé nedostatky (požadavek č. 1 a 2)**

- `src/components/LyricsPanel.jsx:81` — jakmile `/api/captions` vrátí
  JAKOUKOLI ruční titulkovou stopu, appka ji nepodmíněně použije místo
  uživatelem vybraných LRCLIB textů — ale nekontroluje se JAZYK stopy.
  Pokud má video anglické titulky k neanglické písni (běžné u
  automaticky generovaných překladových titulků na YouTube), zobrazí se
  špatný jazyk textu, i když LRCLIB měl správný. Oprava: předat
  preferovaný jazyk do `/api/captions?lang=...` (parametr `lang` už
  `api/captions.js` podporuje, viz `pickTrack`) NEBO porovnat jazyk
  vrácené stopy s očekávaným jazykem (podle `dominantScript` z LRCLIB
  kandidáta) a při neshodě dát přednost LRCLIB.
- `src/components/LyricsPanel.jsx:142` (`scheduleRematch`) — když se
  délka přehrávaného videa liší od LRCLIB nahrávky o víc než 1.5s,
  appka potichu VYMĚNÍ text za jinou verzi nalezenou podle délky. Toto
  může přebít uživatelem VÝSLOVNĚ vybraný text (v `SongPicker` uživatel
  klikl na konkrétní nahrávku) za jinou verzi, která má sice sedící
  délku, ale může být úplně jiná (live verze, remix). Zvážit: buď tuhle
  automatiku vypnout pro explicitně vybrané `lyricsId` (rematch dělat
  jen pro `discoverLyricsForVideo` cestu, ne pro `getLyricsById` cestu),
  nebo aspoň UI upozornění "text byl automaticky přepnut".
- `src/lib/lyrics.js:202` (`discoverLyricsForVideo`, segmentace názvu) —
  regex `split(/[|•·]+|\s[–—]\s/)` dělí název videa na segmenty jen na
  dlouhých pomlčkách (–, —) obalených mezerami, NE na obyčejné ASCII
  pomlčce `-`. Nejběžnější formát názvu na YouTube je přitom přesně
  `Artist - Song (Official Video)` s obyčejnou pomlčkou. Přidat `-` do
  regexu (opatrně — kraťoučké názvy typu "Rock-n-Roll" by se neměly
  rozsekat, takže dávej pozor na mezery kolem pomlčky: `\s-\s`).
- `src/lib/lyrics.js` (`discoverLyricsForVideo`, tolerance) — písničky
  přidané přímo odkazem (bez LRCLIB výběru) dostanou text jen pokud se
  najde LRCLIB nahrávka se sedící délkou (±2.5s). Video s delším intrem
  nebo outrem než běžná verze na LRCLIB text nedostane vůbec — nic,
  žádná zpráva navíc, prostě ticho. To je zbytek "spolehlivá extrakce i
  bez titulků" požadavku, kde appka reálně nic nenajde. Zvážit vyšší
  toleranci s jasným varováním "text nemusí sedět přesně" místo úplného
  selhání, nebo (lepší) nechat uživatele ručně doladit offset (funkce
  "v takt" v `LyricsPanel.jsx` už existuje přesně pro tenhle účel — jen
  ho appka v tomhle případě vůbec nenabídne, protože text se vůbec
  nenačte).

**F. Ztráta skóre při chybě přehrávače**

`src/screens/PlayScreen.jsx`, funkce `goNext` volaná z error obrazovky
(řádek ~393 dřívějšího auditu, teď po refaktoru zkontroluj aktuální
řádek) — když přehrávač spadne s chybou uprostřed písně a uživatel
klikne "další píseň", `engineRef.current` se zahodí BEZ zavolání
`onSongFinished`, takže rozzpívané skóre (i když zpěvák zpíval 3
minuty) se ztratí a nezapočítá do žebříčku. Srovnej s `handleExit`,
která toto řeší správně (`if (engineRef.current && singTime > 8) {
finish + onSongFinished }`) — stejnou logiku doplnit i do error-cesty
`goNext`.

Zároveň `goNext` nereseuje `live` a `micFailed` stav mezi písněmi — další
píseň může krátce ukázat skóre/HUD z předchozí písně a špatně nastavenou
ikonu mikrofonu.

### 🟡 Nice-to-have (nejsou v explicitním zadání, ale audit je našel)

- **MQTT sdílené místnosti** (`src/lib/room.js`, `src/App.jsx`): host
  nemůže trvale odebrat hosta (MQTT retained zpráva ho "vzkřísí"),
  smazání písničky z playlistu hosta se taky nedrží, fotky hráčů
  (base64) se republikují na VEŘEJNÝ MQTT broker každých 5 sekund během
  přehrávání (zbytečná zátěž + únik dat na veřejný broker), sdílený
  "secret" místnosti umožňuje libovolnému hostu vydávat se za hostitele.
  Tohle je vedlejší funkce (appka funguje i bez ní) — pokud majitel
  místnosti nepoužívá, dá se nechat na později; pokud je používá
  aktivně na párty s cizími lidmi, `room.js` bezpečnostní model stojí
  za přepracování.
- `src/lib/roomCrypto.js`: `crypto.subtle` je nedostupné přes obyčejné
  HTTP (jen HTTPS/localhost) — místnosti tiše spadnou do stavu
  "offline" bez vysvětlení proč. Totéž `navigator.mediaDevices` pro
  mikrofon. Ujisti se, že produkční nasazení (ať zvolíš cokoli z bodu D)
  běží přes HTTPS — bez toho nepůjde mikrofon ani sdílené místnosti.
- Drobnosti: `App.jsx` má vedlejší efekty (`clearGuestRoom`,
  localStorage čtení) přímo v těle komponenty místo v `useEffect`
  (funguje to, ale je to křehké vůči React Strict Mode/budoucím
  optimalizacím).

## Jak pokračovat — doporučený postup

1. Nejdřív **A** a **B** (kritické, malé, rychlé opravy — pár řádků
   každá).
2. **F** (ztráta skóre) — taky malá oprava, hned vedle B v tomtéž
   souboru, dává smysl udělat spolu.
3. **D** (architektura serveru) — středně velká práce, ale zásadní pro
   "no Vercel" požadavek. Doporučuju udělat TEĎ, ne až nakonec, protože
   ovlivňuje, jak se bude celá appka testovat/nasazovat pro zbytek úkolů.
4. **C** (transkripce) — nejvíc práce, udělej aspoň hebrejštinu pořádně
   (rozšířit slovník, doladit pravidla) + arabštinu stejnou technikou.
5. **E** (lyrics edge cases) — postupně, podle času.
6. Na závěr znovu spustit `npm test` a `npm run build`, a pokud je
   možnost reálného síťového přístupu (tohle sandbox prostředí NEMĚLO
   odchozí přístup na youtube.com/lrclib.net — `curl` vracel `exit 56`
   / connection reset), **otestovat naživo** aspoň jednu skutečnou
   písničku v hebrejštině a jednu v ukrajinštině/češtině, včetně
   mikrofonu (potřeba HTTPS nebo `localhost`).
7. Commit + push na `claude/karaokeno-app-completion-118r8w`, PR #23 je
   už otevřený a čeká — netvořit nový branch/PR.
8. Až bude appka podle tebe hotová vůči všem 8 bodům zadání, napiš
   finální shrnutí PRO MAJITELE (ne technický changelog) — česky,
   srozumitelně, bez žargonu, protože není programátor a explicitně
   nechce být zatěžovaný dotazy ani detaily.

## Poznámky k testování v tomto sandboxu

- Toto vývojové prostředí NEMÁ odchozí síťový přístup na `youtube.com`,
  `lrclib.net` ani `img.youtube.com` (ověřeno přes `curl`, timeout/reset
  na všech). Jakékoli reálné end-to-end testování (skutečné vyhledávání,
  skutečné přehrání, skutečné titulky) tady není možné — proto byl
  Playwright test postavený na mockovaném `window.YT` a mockovaném
  LRCLIB `fetch`. Pokud navazující agent běží v prostředí S přístupem k
  internetu, DOPORUČUJI zopakovat manuální test s reálnou písničkou.
- `npm test` (vitest) běží čistě offline (36 testů, viz `tests/`) a
  pokrývá jen čistou logiku (parsování LRC, parsování YouTube captions
  JSON, `ScoreEngine`, parsování YouTube URL, parsování YouTube search
  JSON) — ne UI, ne síť.
- Chromium pro Playwright je v tomhle prostředí na
  `/opt/pw-browsers/chromium` (proměnná `PLAYWRIGHT_BROWSERS_PATH`) —
  pokud navazující agent běží jinde, možná bude potřeba jiná cesta nebo
  `npx playwright install`.
