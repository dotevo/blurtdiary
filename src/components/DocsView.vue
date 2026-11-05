<script setup lang="ts">
import { computed } from 'vue';
import { lang, t } from '../lib/i18n';
import { href, navigate, USER } from '../lib/store';
import LangSelect from './LangSelect.vue';

// Documentation exists in Polish and English; every other interface language shows the English text.
const pl = computed(() => lang.value === 'pl');
const home = (): string => (USER ? href({}) : '?');
</script>

<template>
  <main class="docs">
    <header class="docs-head"><h1>Blurt Diary</h1><LangSelect /></header>
    <p><a :href="home()" @click.prevent="navigate(home())">{{ t('backToBlog') }}</a></p>

    <div v-if="pl">
<p class="mute">Blog jednego użytkownika Blurt, który działa wprost z blockchaina. Konfigurujesz go po zalogowaniu – bez serwera i bez własnej bazy danych.</p>
<nav class="toc"><b>Spis treści:</b><br>
<a href="#pl-start">Szybki start</a><a href="#pl-config">Gdzie są ustawienia</a><a href="#pl-ref">Opis ustawień</a><a href="#pl-cats">Kategorie i tagi</a><a href="#pl-write">Pisanie wpisów</a><a href="#pl-tip">Beneficjenci i dev tip</a><a href="#pl-old">Głosowanie na stare wpisy</a><a href="#pl-coal">Lista COAL</a><a href="#pl-chains">Inne blockchainy</a><a href="#pl-url">Parametry adresu</a><a href="#pl-host">Własny blog na GitHub Pages</a><a href="#pl-faq">Problemy</a></nav>

<h2 id="pl-start">Szybki start</h2>
<ol>
<li>Otwórz stronę z parametrem swojego konta: <code>…/?user=twojanazwa</code>. To parametr <code>user</code> decyduje, czyj blog się wyświetla.</li>
<li>Kliknij <b>Zaloguj</b> – kluczem <i>posting</i> (zostaje tylko w tej karcie przeglądarki) albo przez <b>WhaleVault</b>.</li>
<li>Po zalogowaniu na <b>własnym</b> blogu pojawią się przyciski <b>✍ Napisz</b> i <b>⚙</b> (ustawienia).</li>
<li>W ustawieniach wybierz paletę, kolory, kategorie i linki. Zmiany widać od razu. Kliknij <b>Zapisz</b>.</li>
<li>Gotowe – wyślij czytelnikom link <code>…/?user=twojanazwa</code>.</li>
</ol>

<h2 id="pl-config">Gdzie zapisane są ustawienia</h2>
<p>Ustawienia to <b>zwykły, czytelny wpis</b> na Twoim koncie o stałym adresie <code>@twojanazwa/blurt-diary-config</code>. Blog znajduje go sam – nie trzeba nic wpisywać w profilu. Konfigurator tworzy ten wpis przy pierwszym zapisie (z wyłączoną wypłatą, więc nie zbiera nagród), a potem go edytuje. Wpis nie pojawia się na liście postów bloga.</p>
<div class="note"><b>Dlaczego wpis, a nie metadane profilu?</b> Zmiana metadanych konta wymaga zwykle klucza <i>active</i>, a Blurt Diary używa wyłącznie uprawnień <i>posting</i> (taki klucz lub WhaleVault w trybie posting). Wpis można edytować samym kluczem posting. Jeśli wolisz własny wpis lub metadane, patrz niżej.</div>
<h3>Ręczna edycja</h3>
<p>Wpis możesz edytować też ręcznie na dowolnym froncie Blurt. Format to proste linie <code>klucz: wartość</code>, bez JSON-a:</p>
<pre><code># Blurt Diary - settings

title: Blog Dotevo
subtitle: Podróże, kod i życie
about: Piszę o tym, co mnie zajmuje.
cover: https://img.blurt.blog/obraz.jpg
language: pl
footer: Wszystkie prawa zastrzeżone

palette: ocean
accent: #0a74b9
accent-dark: #4aa8e0
font: serif
layout: grid
sidebar: right
logo: https://img.blurt.blog/logo.png
panels:
- about
- Moje linki | Zajrzyj na [GitHub](https://github.com/dotevo) i **Mastodon**
- comments
- payouts

links:
- GitHub | https://github.com/dotevo
- Mastodon | https://mastodon.social/@dotevo

categories:
- Podróże | travel, podroze | Wyprawy i relacje
- Programowanie | dev, coding</code></pre>
<p>Linie, których blog nie rozumie, są ignorowane, więc możesz dopisywać własne komentarze. Stary format (<code># title: …</code> oraz <code>&gt; Nazwa | tagi | opis</code>) nadal działa.</p>
<h3>Własny wpis lub metadane (opcjonalnie)</h3>
<p>Jeśli wpis <code>blurt-diary-config</code> nie istnieje, blog szuka linku w profilu: pole <code>diary_config</code> (lub <code>blog_config</code>) w <code>posting_json_metadata.profile</code> o wartości <code>autor/permlink</code>, albo znacznika <code>[[Diary config:autor/permlink]]</code> w polu <i>about</i>. Wpis <code>blurt-diary-config</code> ma pierwszeństwo.</p>
<div class="note">Ze względów bezpieczeństwa wartości z konfiguracji są filtrowane: kolory muszą być zapisem szesnastkowym, adresy muszą zaczynać się od <code>https://</code>, a czcionka, układ i panel boczny przyjmują tylko podane niżej wartości.</div>

<h2 id="pl-ref">Opis ustawień</h2>
<table>
<thead><tr><th>Klucz</th><th>Znaczenie</th></tr></thead>
<tbody>
<tr><td><code>title</code>, <code>subtitle</code></td><td>Tytuł i podtytuł w nagłówku (do 80 / 160 znaków).</td></tr>
<tr><td><code>about</code></td><td>Krótki opis w panelu bocznym (do 600 znaków).</td></tr>
<tr><td><code>cover</code></td><td>Obraz w nagłówku, adres <code>https://</code>. Bez niego używany jest obraz okładki z profilu.</td></tr>
<tr><td><code>language</code></td><td>Domyślny język bloga: <code>pl</code>, <code>en</code>, <code>de</code>, <code>fr</code>, <code>es</code>, <code>eo</code>. Czytelnik, który wybrał własny język, zawsze go zachowuje.</td></tr>
<tr><td><code>footer</code></td><td>Tekst w stopce.</td></tr>
<tr><td><code>pinned</code></td><td>Permlink jednego z Twoich wpisów, który wyświetla się <b>jako pierwszy</b> na głównej liście (przypięty, z oznaczeniem 📌).</td></tr>
<tr><td><code>blogroll:</code></td><td>Polecane blogi, po jednym w linii: <code>- konto | krótki opis</code> (do 20). Pokazują się w panelu bocznym <code>blogroll</code>. Opis to zwykły tekst.</td></tr>
<tr><td><code>palette</code></td><td><code>default</code>, <code>paper</code>, <code>ocean</code>, <code>forest</code>, <code>rose</code>, <code>graphite</code>. Każda paleta ma wersję jasną i ciemną.</td></tr>
<tr><td><code>accent</code>, <code>accent-dark</code></td><td>Kolor akcentu w motywie jasnym i ciemnym (<code>#rrggbb</code>). Bez <code>accent-dark</code> używany jest <code>accent</code>.</td></tr>
<tr><td><code>bg</code>, <code>bg-dark</code></td><td>Kolor tła w motywie jasnym i ciemnym.</td></tr>
<tr><td><code>font</code></td><td><code>sans</code>, <code>serif</code> lub <code>mono</code>.</td></tr>
<tr><td><code>layout</code></td><td><code>grid</code> (kafelki) lub <code>list</code>.</td></tr>
<tr><td><code>sidebar</code></td><td><code>right</code>, <code>left</code> lub <code>none</code>.</td></tr>
<tr><td><code>radius</code></td><td><code>soft</code> (domyślnie), <code>sharp</code> lub <code>round</code> – zaokrąglenie rogów.</td></tr>
<tr><td><code>cards</code></td><td><code>shadow</code> (domyślnie), <code>flat</code> lub <code>lifted</code>.</td></tr>
<tr><td><code>density</code></td><td><code>normal</code>, <code>compact</code> lub <code>airy</code> – odstępy.</td></tr>
<tr><td><code>width</code></td><td><code>normal</code>, <code>narrow</code> lub <code>wide</code> – szerokość strony.</td></tr>
<tr><td><code>columns</code></td><td><code>auto</code>, <code>2</code>, <code>3</code> lub <code>4</code> – kolumny siatki (na telefonie zawsze 1).</td></tr>
<tr><td><code>hero</code></td><td><code>normal</code>, <code>compact</code> lub <code>tall</code> – wysokość nagłówka.</td></tr>
<tr><td><code>text-size</code></td><td><code>normal</code>, <code>small</code> lub <code>large</code> – tekst artykułu.</td></tr>
<tr><td><code>headings</code></td><td><code>inherit</code>, <code>serif</code>, <code>sans</code> lub <code>mono</code> – czcionka nagłówków.</td></tr>
<tr><td><code>thumbs</code></td><td><code>show</code> lub <code>hide</code> – obrazki na kartach.</td></tr>
<tr><td><code>rewards</code></td><td><code>show</code> lub <code>hide</code> – kwoty nagród. (Pierwsza wartość każdej opcji = dotychczasowy wygląd; nieznane wartości są ignorowane.)</td></tr>
<tr><td><code>logo</code></td><td>Logo w nagłówku zamiast awatara, adres <code>https://</code>.</td></tr>
<tr><td><code>panels:</code></td><td>Panele boczne <b>w podanej kolejności</b>: <code>about</code>, <code>payouts</code> (oczekujące wypłaty), <code>comments</code> (ostatnie komentarze), <code>categories</code> (lista kategorii), <code>archive</code> (archiwum miesięcy – pokazuje tylko to, co już wczytano; „Pokaż starsze miesiące" dociąga kolejne 20 wpisów), <code>blogroll</code> (polecane blogi) albo własny panel <code>- Tytuł | tekst</code> (Markdown w jednej linii, do 500 znaków, maks. 6 własnych). Pominięty panel się nie wyświetla; <code>panels: none</code> usuwa wszystkie. Stary zapis <code>widgets: about, comments</code> nadal działa.</td></tr>
<tr><td><code>links:</code></td><td>Lista <code>- Nazwa | https://adres</code> – wyświetlana w nagłówku.</td></tr>
<tr><td><code>categories:</code></td><td>Lista <code>- Nazwa | tag1, tag2 | opis</code>.</td></tr>
</tbody>
</table>
<p>Jasny i ciemny motyw przełączają się <b>automatycznie</b> według ustawień systemu lub telefonu czytelnika – nie ma ręcznego przełącznika.</p>

<h2 id="pl-cats">Kategorie i tagi</h2>
<p>Do jednej kategorii możesz przypisać <b>wiele tagów</b> (np. <code>- Podróże | travel, podroze, wyprawy</code>) – wpis należy do niej, jeśli ma <b>którykolwiek</b> z nich. Ten sam tag może występować w kilku kategoriach. Bez zdefiniowanych kategorii blog tworzy je sam z najczęstszych tagów. Po wybraniu kategorii blog prosi węzeł o same wpisy z danym tagiem (<code>bridge.search_posts</code>, jedno zapytanie na każdy tag kategorii), więc nie pobiera całej historii. Wyniki są dodatkowo sprawdzane w przeglądarce.</p>

<h2 id="pl-write">Pisanie wpisów</h2>
<p>Przycisk <b>✍ Napisz</b> (tylko na własnym blogu) otwiera edytor Markdown z podglądem i wgrywaniem obrazków.</p>
<ul>
<li><b>Tagi</b> – do 5, oddzielone przecinkami lub spacjami (<code>a–z</code>, <code>0–9</code>, myślnik). <b>Pierwszy tag jest kategorią wpisu.</b> Bez tagów wpis dostaje tag <code>blurt</code>.</li>
<li><b>Community</b> (opcjonalnie) – wpisz ręcznie konto community, np. <code>blurt-179874</code>. Wtedy community staje się kategorią wpisu, a 3% nagrody trafia do community. Puste pole = wpis tylko na Twoim blogu.</li>
<li><b>Obrazy</b> – przycisk „Dodaj obraz” wgrywa plik (do 10 MB) na serwer obrazów Blurt i wstawia znacznik Markdown. Pierwszy obraz staje się miniaturką wpisu.</li>
<li><b>Szkic</b> zapisuje się automatycznie w tej przeglądarce i znika po publikacji.</li>
</ul>
<p>Blockchain ogranicza częstotliwość publikowania postów (kilka minut między wpisami); ewentualny błąd zobaczysz w komunikacie.</p>

<h2 id="pl-tip">Beneficjenci i dev tip</h2>
<p>Komentarze i wpisy wysyłane przez tę stronę mogą kierować część nagrody do beneficjentów. Przy każdym formularzu widać dokładną listę.</p>
<ul>
<li><b>1% dla @dotevo</b> (autor aplikacji) – tzw. <i>dev tip</i>. Włączony domyślnie. Wyłączysz go polem wyboru na samym dole formularza (komentarz, odpowiedź, nowy wpis); ustawienie jest zapamiętane.</li>
<li><b>3% dla community</b> – gdy wątek lub wpis jest w community (konto <code>blurt-…</code>). Dotyczy wszystkich komentarzy w takim wątku.</li>
<li>Gdy autorem jest sam @dotevo, nie dodaje się beneficjenta @dotevo; community nie dostaje 3% od własnego konta.</li>
<li>Wpis z ustawieniami bloga ma wyłączoną wypłatę i nie ma beneficjentów.</li>
</ul>

<h2 id="pl-old">Głosowanie na stare wpisy</h2>
<p>Po 7 dniach wpis jest wypłacony i łańcuch nie przyjmuje już głosów. Blurt Diary robi wtedy to samo co BlurtForum:</p>
<ol>
<li>szuka Twojego <b>komentarza wspierającego</b> pod tym wpisem, młodszego niż 7 dni, z <b>tymi samymi beneficjentami co oryginał</b>;</li>
<li>jeśli go nie ma, tworzy taki komentarz („Supporting original content by @autor”) z beneficjentami skopiowanymi z oryginału (gdy oryginał ich nie ma – 100% dla autora);</li>
<li>głosuje na ten komentarz, więc nagroda trafia do autora oryginału. Dodatkowo próbuje zagłosować na sam oryginał.</li>
</ol>
<p>Siłę głosu ustawiasz w pasku (♥ 100%…10%) lub suwakiem w oknie wsparcia.</p>

<h2 id="pl-coal">Lista COAL</h2>
<p>Komentarze kont z listy COAL (spam, scam, podszywanie się) są <b>rozmyte</b> i wymagają kliknięcia „Rozumiem, pokaż komentarz”. Treść takiego komentarza (w tym obrazki i linki) nie jest w ogóle ładowana, dopóki jej nie odsłonisz. Konta z listy nie pojawiają się w ostatnich komentarzach ani w powiadomieniach. Lista jest pobierana z <code>coal.blurtwallet.com</code> i buforowana na dobę. Do testów dopisz do adresu <code>&amp;coal=nazwa1,nazwa2</code>.</p>

<h2 id="pl-chains">Inne blockchainy (Hive, Steem)</h2>
<p>Blurt jest zawsze <b>główną</b> siecią: listy wpisów, kategorie, wyszukiwanie i powiadomienia pochodzą wyłącznie z Blurt. Pozostałe sieci to <i>lustra</i> – te same wpisy i komentarze pod tym samym permlinkiem.</p>
<ul>
<li><b>Konta</b> – w konfiguratorze (⚙ → <i>Konta w innych blockchainach</i>) wpisz swoje nazwy kont, np. <code>hive | moje-konto</code>. Zapisują się w poście ustawień na Blurt, więc widzą je też odwiedzający.</li>
<li><b>Publikowanie</b> – wpis trafia na Blurt oraz do każdej sieci, w której jesteś zalogowany na konto z ustawień.</li>
<li><b>Ikonki pod tytułem wpisu</b> – kolorowa: wpis jest w tej sieci (kliknij, by go otworzyć); przerywana: nie ma go tam, a właściciel widzi przycisk <b>Prześlij do…</b>; czerwony „!”: nie udało się zapytać węzła (nie wiemy, czy wpis istnieje – kliknij, by ponowić).</li>
<li><b>Komentarze i odpowiedzi</b> trafiają do wszystkich sieci, w których jesteś zalogowany <i>i</i> w których istnieje komentowany wpis lub komentarz. Własny komentarz możesz później skopiować do innej sieci przyciskiem <b>Prześlij do…</b>.</li>
<li><b>Różne wersje</b> – kopie łączymy po permlinku (nazwy kont mogą się różnić). Jeśli ktoś edytował tekst tylko w jednej sieci, pojawia się „⚠ wersje różnią się” z możliwością przeczytania każdej wersji.</li>
<li><b>Głosowanie i nagrody</b> – ♥ głosuje we wszystkich sieciach, w których jesteś zalogowany i gdzie istnieje kopia; na pasku widać siłę głosu (VP) każdej sieci, a każda z oczekującymi nagrodami ma własny przycisk 🎁.</li>
<li><b>Obrazy</b> – przy wstawianiu trafiają osobno na serwer obrazów każdej zalogowanej sieci, a kopia wpisu w danej sieci używa jej własnych adresów.</li>
</ul>
<p class="mute">Powiadomienia i komentarze wspierające stare wpisy działają tylko na Blurt. Szczegóły techniczne: <code>docs/MULTICHAIN.md</code> w repozytorium.</p>
<h2 id="pl-url">Parametry adresu</h2>
<table>
<tbody>
<tr><td><code>user</code></td><td>Konto, którego blog się wyświetla (wymagany).</td></tr>
<tr><td><code>cat</code></td><td>Identyfikator kategorii (np. <code>podroze</code>).</td></tr>
<tr><td><code>post</code></td><td>Permlink wpisu albo <code>autor/permlink</code>. Link do komentarza otwiera jego wpis główny.</td></tr>
<tr><td><code>c</code></td><td><code>autor/permlink</code> komentarza do przewinięcia i podświetlenia.</td></tr>
<tr><td><code>view</code></td><td><code>write</code> (edytor) lub <code>settings</code> (konfigurator) – tylko dla właściciela; <code>docs</code> – ta dokumentacja (działa też bez <code>user</code>).</td></tr>
<tr><td><code>recent</code></td><td>Diagnostyka ostatnich komentarzy: <code>auto</code>, <code>replies</code>, <code>own</code>, <code>scan</code>.</td></tr>
<tr><td><code>coal</code></td><td>Testowe dopisanie kont do listy COAL.</td></tr>
</tbody>
</table>
<p>Portfel (przelewy, Blurt Power itd.) obsługuje <a href="https://blurtwallet.com" target="_blank" rel="noopener">blurtwallet.com</a> – w pasku jest tylko link. Po zalogowaniu blog pokazuje przycisk 🎁 do odebrania zaległych nagród oraz powiadomienia 🔔.</p>

<h2 id="pl-host">Własny blog na GitHub Pages</h2>
<ol>
<li>Utwórz repozytorium z kodem Blurt Diary (fork lub kopia).</li>
<li><i>Settings → Pages → Source:</i> <b>GitHub Actions</b>.</li>
<li>Workflow <code>.github/workflows/deploy.yml</code> przy każdym pushu do <code>main</code> uruchamia <code>npm ci</code>, <code>npm run type-check</code> i <code>npm run build</code>, a potem publikuje katalog <code>dist</code>.</li>
<li>Opcjonalnie w <i>Settings → Variables</i> ustaw <code>VITE_BASE</code> (np. <code>/nazwa-repo/</code>). Bez niej używane są ścieżki względne, które działają pod dowolnym adresem.</li>
<li>Blog będzie pod <code>https://TWOJ-LOGIN.github.io/NAZWA-REPO/?user=twojanazwa</code>. Ta sama instalacja obsługuje dowolne konta – zmienia się tylko parametr <code>user</code>.</li>
</ol>
<p>Lokalnie: <code>npm install</code>, <code>npm run dev</code>.</p>

<h2 id="pl-faq">Problemy</h2>
<ul>
<li><b>Pusta strona / błąd sieci</b> – węzły RPC bywają niedostępne; blog sam próbuje kolejnych. Sprawdź konsolę przeglądarki (ostrzeżenia <code>RPC node failed</code>).</li>
<li><b>Nie widzę przycisków ✍ i ⚙</b> – są tylko wtedy, gdy zalogowane konto jest właścicielem bloga z parametru <code>user</code>.</li>
<li><b>Zapis ustawień się nie powiódł</b> – zobacz komunikat z łańcucha (np. zbyt częste publikowanie). Ustawienia można też wkleić ręcznie do wpisu <code>blurt-diary-config</code>.</li>
<li><b>Nowy wpis nie widać na liście innych</b> – po publikacji pojawia się od razu u Ciebie, a u innych po odświeżeniu, gdy węzły go zindeksują.</li>
</ul>
    </div>
    <div v-else>
<p class="mute">(The documentation is available in Polish and English; other interface languages show the English version.)</p>
<p class="mute">A single-user Blurt blog that runs straight from the blockchain. You configure it after logging in – no server and no database of your own.</p>
<nav class="toc"><b>Contents:</b><br>
<a href="#en-start">Quick start</a><a href="#en-config">Where settings live</a><a href="#en-ref">Settings reference</a><a href="#en-cats">Categories &amp; tags</a><a href="#en-write">Writing posts</a><a href="#en-tip">Beneficiaries &amp; dev tip</a><a href="#en-old">Voting on old posts</a><a href="#en-coal">COAL list</a><a href="#en-chains">Other blockchains</a><a href="#en-url">URL parameters</a><a href="#en-host">Hosting on GitHub Pages</a><a href="#en-faq">Troubleshooting</a></nav>

<h2 id="en-start">Quick start</h2>
<ol>
<li>Open the site with your account in the URL: <code>…/?user=yourname</code>. The <code>user</code> parameter decides whose blog is shown.</li>
<li>Click <b>Log in</b> – with your <i>posting</i> key (kept only in this browser tab) or via <b>WhaleVault</b>.</li>
<li>On <b>your own</b> blog you now get the <b>✍ Write</b> and <b>⚙</b> (settings) buttons.</li>
<li>In the settings pick a palette, colours, categories and links. Changes are previewed live. Click <b>Save</b>.</li>
<li>Done – share <code>…/?user=yourname</code> with your readers.</li>
</ol>

<h2 id="en-config">Where the settings are stored</h2>
<p>The settings are an <b>ordinary, human-readable post</b> on your account at the fixed address <code>@yourname/blurt-diary-config</code>. The blog finds it on its own – nothing has to be added to your profile. The configurator creates the post on the first save (with payout disabled, so it collects no rewards) and edits it afterwards. It never shows up in the blog's post list.</p>
<div class="note"><b>Why a post and not profile metadata?</b> Changing account metadata usually requires the <i>active</i> key, while Blurt Diary only uses <i>posting</i> authority (a posting key or WhaleVault in posting mode). A post can be edited with the posting key alone. If you prefer your own post or metadata, see below.</div>
<h3>Editing by hand</h3>
<p>You can also edit the post by hand on any Blurt front end. The format is plain <code>key: value</code> lines, not JSON:</p>
<pre><code># Blurt Diary - settings

title: Dotevo's Blog
subtitle: Travel, code and life
about: I write about whatever keeps me busy.
cover: https://img.blurt.blog/image.jpg
language: en
footer: All rights reserved

palette: ocean
accent: #0a74b9
accent-dark: #4aa8e0
font: serif
layout: grid
sidebar: right
logo: https://img.blurt.blog/logo.png
panels:
- about
- My links | See [GitHub](https://github.com/dotevo) and **Mastodon**
- comments
- payouts

links:
- GitHub | https://github.com/dotevo
- Mastodon | https://mastodon.social/@dotevo

categories:
- Travel | travel, trips | Journeys and reports
- Programming | dev, coding</code></pre>
<p>Lines the blog does not understand are ignored, so you can add your own notes. The legacy format (<code># title: …</code> and <code>&gt; Name | tags | description</code>) still works.</p>
<h3>Your own post or metadata (optional)</h3>
<p>If <code>blurt-diary-config</code> does not exist, the blog looks for a link in your profile: the <code>diary_config</code> (or <code>blog_config</code>) field in <code>posting_json_metadata.profile</code> with the value <code>author/permlink</code>, or a <code>[[Diary config:author/permlink]]</code> marker in <i>about</i>. The <code>blurt-diary-config</code> post takes priority.</p>
<div class="note">For safety the values from the settings are filtered: colours must be hex codes, URLs must start with <code>https://</code>, and font, layout and sidebar accept only the values listed below.</div>

<h2 id="en-ref">Settings reference</h2>
<table>
<thead><tr><th>Key</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>title</code>, <code>subtitle</code></td><td>Title and subtitle in the header (up to 80 / 160 characters).</td></tr>
<tr><td><code>about</code></td><td>Short description in the sidebar (up to 600 characters).</td></tr>
<tr><td><code>cover</code></td><td>Header image, an <code>https://</code> URL. Without it the profile's cover image is used.</td></tr>
<tr><td><code>language</code></td><td>Default blog language: <code>pl</code>, <code>en</code>, <code>de</code>, <code>fr</code>, <code>es</code>, <code>eo</code>. A reader who picked their own language always keeps it.</td></tr>
<tr><td><code>footer</code></td><td>Footer text.</td></tr>
<tr><td><code>pinned</code></td><td>Permlink of one of your posts that is shown <b>first</b> on the main list (pinned, marked 📌).</td></tr>
<tr><td><code>blogroll:</code></td><td>Recommended blogs, one per line: <code>- account | short description</code> (up to 20). Shown in the <code>blogroll</code> sidebar panel. The description is plain text.</td></tr>
<tr><td><code>palette</code></td><td><code>default</code>, <code>paper</code>, <code>ocean</code>, <code>forest</code>, <code>rose</code>, <code>graphite</code>. Every palette has a light and a dark version.</td></tr>
<tr><td><code>accent</code>, <code>accent-dark</code></td><td>Accent colour in the light and dark theme (<code>#rrggbb</code>). Without <code>accent-dark</code>, <code>accent</code> is used.</td></tr>
<tr><td><code>bg</code>, <code>bg-dark</code></td><td>Background colour in the light and dark theme.</td></tr>
<tr><td><code>font</code></td><td><code>sans</code>, <code>serif</code> or <code>mono</code>.</td></tr>
<tr><td><code>layout</code></td><td><code>grid</code> (tiles) or <code>list</code>.</td></tr>
<tr><td><code>sidebar</code></td><td><code>right</code>, <code>left</code> or <code>none</code>.</td></tr>
<tr><td><code>radius</code></td><td><code>soft</code> (default), <code>sharp</code> or <code>round</code> – corner rounding.</td></tr>
<tr><td><code>cards</code></td><td><code>shadow</code> (default), <code>flat</code> or <code>lifted</code>.</td></tr>
<tr><td><code>density</code></td><td><code>normal</code>, <code>compact</code> or <code>airy</code> – spacing.</td></tr>
<tr><td><code>width</code></td><td><code>normal</code>, <code>narrow</code> or <code>wide</code> – page width.</td></tr>
<tr><td><code>columns</code></td><td><code>auto</code>, <code>2</code>, <code>3</code> or <code>4</code> – grid columns (always 1 on phones).</td></tr>
<tr><td><code>hero</code></td><td><code>normal</code>, <code>compact</code> or <code>tall</code> – header height.</td></tr>
<tr><td><code>text-size</code></td><td><code>normal</code>, <code>small</code> or <code>large</code> – article text.</td></tr>
<tr><td><code>headings</code></td><td><code>inherit</code>, <code>serif</code>, <code>sans</code> or <code>mono</code> – heading font.</td></tr>
<tr><td><code>thumbs</code></td><td><code>show</code> or <code>hide</code> – images on cards.</td></tr>
<tr><td><code>rewards</code></td><td><code>show</code> or <code>hide</code> – reward amounts. (The first value of every option is the classic look; unknown values are ignored.)</td></tr>
<tr><td><code>logo</code></td><td>Header logo instead of the avatar, an <code>https://</code> URL.</td></tr>
<tr><td><code>panels:</code></td><td>Sidebar panels <b>in the given order</b>: <code>about</code>, <code>payouts</code> (pending payouts), <code>comments</code> (recent comments), <code>categories</code> (category list), <code>archive</code> (months – built from the posts already loaded; "Show older months" fetches 20 more posts), <code>blogroll</code> (recommended blogs) or your own panel <code>- Title | text</code> (single-line Markdown, up to 500 characters, at most 6 custom ones). A panel that is not listed is not shown; <code>panels: none</code> removes them all. The old <code>widgets: about, comments</code> line still works.</td></tr>
<tr><td><code>links:</code></td><td>A list of <code>- Name | https://url</code> – shown in the header.</td></tr>
<tr><td><code>categories:</code></td><td>A list of <code>- Name | tag1, tag2 | description</code>.</td></tr>
</tbody>
</table>
<p>Light and dark themes switch <b>automatically</b> with the reader's system or phone setting – there is no manual toggle.</p>

<h2 id="en-cats">Categories and tags</h2>
<p>A category can have <b>several tags</b> (e.g. <code>- Travel | travel, trips, journeys</code>) – a post belongs to it if it has <b>any</b> of them. The same tag can appear in several categories. Without defined categories the blog builds them from the most used tags. When a category is selected, the blog asks the node for just the posts with that tag (<code>bridge.search_posts</code>, one request per tag of the category) instead of loading the whole history. The results are also re-checked in the browser.</p>

<h2 id="en-write">Writing posts</h2>
<p>The <b>✍ Write</b> button (your own blog only) opens a Markdown editor with preview and image upload.</p>
<ul>
<li><b>Tags</b> – up to 5, separated by commas or spaces (<code>a–z</code>, <code>0–9</code>, hyphen). <b>The first tag is the post's category.</b> Without tags the post gets the tag <code>blurt</code>.</li>
<li><b>Community</b> (optional) – type the community account by hand, e.g. <code>blurt-179874</code>. The community then becomes the post's category and 3% of the rewards go to it. Empty = the post lives only on your blog.</li>
<li><b>Images</b> – "Add image" uploads a file (up to 10 MB) to the Blurt image host and inserts the Markdown. The first image becomes the post thumbnail.</li>
<li>The <b>draft</b> is saved automatically in this browser and removed after publishing.</li>
</ul>
<p>The blockchain limits how often you can publish posts (a few minutes between posts); any error is shown as a message.</p>

<h2 id="en-tip">Beneficiaries and the dev tip</h2>
<p>Comments and posts sent through this site may route part of the rewards to beneficiaries. Every form shows the exact list.</p>
<ul>
<li><b>1% to @dotevo</b> (the app author) – the <i>dev tip</i>. On by default. Switch it off with the checkbox at the very bottom of the form (comment, reply, new post); the choice is remembered.</li>
<li><b>3% to the community</b> – when the thread or post is in a community (a <code>blurt-…</code> account). It applies to all comments in such a thread.</li>
<li>When the author is @dotevo himself, no @dotevo beneficiary is added; a community never gets 3% from its own account.</li>
<li>The blog settings post has payout disabled and no beneficiaries.</li>
</ul>

<h2 id="en-old">Voting on old posts</h2>
<p>After 7 days a post is paid out and the chain no longer accepts votes. Blurt Diary then does what BlurtForum does:</p>
<ol>
<li>it looks for your <b>support comment</b> under the post, newer than 7 days, with <b>the same beneficiaries as the original</b>;</li>
<li>if there is none, it creates one ("Supporting original content by @author") with the beneficiaries copied from the original (if the original has none – 100% to the author);</li>
<li>it votes on that comment, so the reward goes to the original author. It also tries to vote on the original itself.</li>
</ol>
<p>Set the vote weight in the bar (♥ 100%…10%) or with the slider in the support dialog.</p>

<h2 id="en-coal">The COAL list</h2>
<p>Comments by accounts on the COAL list (spam, scam, impersonation) are <b>blurred</b> and need a click on "I understand, show the comment". The content of such a comment (including images and links) is not loaded at all until you reveal it. Listed accounts do not appear in recent comments or notifications. The list comes from <code>coal.blurtwallet.com</code> and is cached for a day. For testing, append <code>&amp;coal=name1,name2</code> to the URL.</p>

<h2 id="en-chains">Other blockchains (Hive, Steem)</h2>
<p>Blurt is always the <b>primary</b> chain: post lists, categories and search come from Blurt only. The other chains are <i>mirrors</i> – the same posts and comments under the same permlink.</p>
<ul>
<li><b>Accounts</b> – in the configurator (⚙ → <i>Accounts on other blockchains</i>) enter your account names, e.g. <code>hive | my-account</code>. They are stored in the settings post on Blurt, so visitors see them too.</li>
<li><b>Publishing</b> – a post goes to Blurt and to every chain where you are logged in with the account from the settings.</li>
<li><b>Badges under a post title</b> – coloured: the post exists on that chain (click to open it); dashed: it does not, and the owner sees a <b>Send to…</b> button; red "!": the node could not be asked (we do not know whether the post exists – click to retry).</li>
<li><b>Comments and replies</b> go to every chain where you are logged in <i>and</i> where the post or comment being answered exists. You can copy your own comment to another chain later with <b>Send to…</b>.</li>
<li><b>Different versions</b> – copies are matched by permlink (account names may differ). If the text was edited on only one chain, a "⚠ versions differ" link lets you read each version.</li>
<li><b>Voting and rewards</b> – ♥ votes on every chain where you are logged in and a copy exists; the bar shows the voting power (VP) of each chain, and every chain with pending rewards has its own 🎁 button.</li>
<li><b>Images</b> – each image is uploaded separately to the image host of every logged-in chain, and a chain's copy of the post uses that chain's own URLs.</li>
</ul>
<p class="mute">The "support old content" comments work on Blurt only. Notifications are collected from every chain you are logged in on (a node without the bridge API simply shows none); links about your own posts open here, others open on that chain's website. Technical details: <code>docs/MULTICHAIN.md</code> in the repository.</p>
<h2 id="en-url">URL parameters</h2>
<table>
<tbody>
<tr><td><code>user</code></td><td>The account whose blog is shown (required).</td></tr>
<tr><td><code>cat</code></td><td>Category id (e.g. <code>travel</code>).</td></tr>
<tr><td><code>post</code></td><td>Post permlink or <code>author/permlink</code>. A link to a comment opens its root post.</td></tr>
<tr><td><code>c</code></td><td><code>author/permlink</code> of the comment to scroll to and highlight.</td></tr>
<tr><td><code>view</code></td><td><code>write</code> (editor) or <code>settings</code> (configurator) – owner only; <code>docs</code> – this documentation (works without <code>user</code> too).</td></tr>
<tr><td><code>recent</code></td><td>Recent-comments diagnostics: <code>auto</code>, <code>replies</code>, <code>own</code>, <code>scan</code>.</td></tr>
<tr><td><code>coal</code></td><td>Temporarily add accounts to the COAL list for testing.</td></tr>
</tbody>
</table>
<p>The wallet (transfers, Blurt Power, etc.) is handled by <a href="https://blurtwallet.com" target="_blank" rel="noopener">blurtwallet.com</a> – the bar only links to it. After logging in the blog shows a 🎁 button to claim pending rewards and 🔔 notifications.</p>

<h2 id="en-host">Your own blog on GitHub Pages</h2>
<ol>
<li>Create a repository with the Blurt Diary code (a fork or a copy).</li>
<li><i>Settings → Pages → Source:</i> <b>GitHub Actions</b>.</li>
<li>On every push to <code>main</code> the workflow <code>.github/workflows/deploy.yml</code> runs <code>npm ci</code>, <code>npm run type-check</code> and <code>npm run build</code>, then publishes the <code>dist</code> folder.</li>
<li>Optionally set <code>VITE_BASE</code> in <i>Settings → Variables</i> (e.g. <code>/repo-name/</code>). Without it relative paths are used, which work under any address.</li>
<li>Your blog will be at <code>https://YOUR-LOGIN.github.io/REPO-NAME/?user=yourname</code>. The same installation serves any account – only the <code>user</code> parameter changes.</li>
</ol>
<p>Locally: <code>npm install</code>, <code>npm run dev</code>.</p>

<h2 id="en-faq">Troubleshooting</h2>
<ul>
<li><b>Blank page / network error</b> – RPC nodes are sometimes down; the blog tries the next one automatically. Check the browser console (<code>RPC node failed</code> warnings).</li>
<li><b>I don't see ✍ and ⚙</b> – they only appear when the logged-in account owns the blog from the <code>user</code> parameter.</li>
<li><b>Saving the settings failed</b> – read the chain's message (e.g. posting too often). You can also paste the settings by hand into the <code>blurt-diary-config</code> post.</li>
<li><b>A new post is missing for other people</b> – after publishing it shows up immediately for you, and for others after a refresh once the nodes have indexed it.</li>
</ul>
    </div>
  </main>
</template>
