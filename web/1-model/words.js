// words.js — suggestions for password gestures (15.11.): two words come as pale chips, the third gesture is one's own.
//
// Purpose:   everyday words that have a common sign in DGS, drawn at random (crypto) so the choice is not guessable.
//            The list grows towards a vocabulary of ~10 000 signs (e.g. from a DGS corpus) without changing the code:
//            security per drawn word = log2(list size) bit (here ≈ 8.2 bit with 300 words, then ≈ 13.3 with 10 000).
// Depends:   Web Crypto (getRandomValues)
// Test:      tests/model.test.mjs
// Limits:    300 words now · two drawn without repeat · a swap (↓ on the chip) draws again.

export const WORDS = `Apfel Arbeit Arm Arzt Auge Auto Baby Bahn Ball Banane Bank Bär Baum Berg Bett Bier Bild Birne Blatt blau Blume Boot Brief Brille Brot Brücke
Bruder Buch Bus Butter Computer Dach Dorf Durst Ei Eis Elefant Eltern Ende Ente Erde Essen Eule Familie Farbe Feder Fenster Fest Feuer Film Finger Fisch
Flasche Fleisch Flugzeug Fluss Frau Freund Frosch Fuchs Fuß Gabel Garten Geld gelb Geschenk Gesicht Gitarre Glas Gras grau grün Haar Hafen Hand Handy Haus
Heft Herz Himmel Hose Hund Hunger Hut Igel Insel Jacke Jahr Junge Kaffee Kamera Karte Käse Katze Kerze Kind Kino Kirche Kirsche Kiste Klavier Kleid Koch
Koffer Kopf Korb Kreis Krone Kuchen Kuh Küche Lampe Land Laub Leiter Licht Löffel Löwe Luft Mädchen Mann Mantel Markt Maus Meer Messer Milch Mond Morgen
Musik Mutter Nacht Nase Nest Netz Ohr Onkel Orange Papier Park Pferd Pilz Pizza Platz Polizei Post Puppe Rad Regen Reis Ring Rock rot Rücken Sack Saft
Salz Sand Schaf Schiff Schlange Schloss Schlüssel Schnee Schrank Schuh Schule Schwein Schwester See Seife Sessel Sonne Spiegel Stadt Stein Stern Stift
Straße Strand Stuhl Stunde Suppe Tag Tante Tasche Tasse Taxi Tee Teller Tier Tisch Tochter Tomate Topf Tor Traum Tür Turm Uhr Vater Vogel Wagen Wald
Wand Wasser Weg Wein weiß Welt Wind Winter Woche Wolke Wolle Wort Wurst Zahn Zeit Zeitung Zelt Zimmer Zitrone Zucker Zug Zunge Adler Ameise Anker Becher
Besen Biene Blitz Bohne Burg Dose Drache Eimer Erbse Fahne Ferse Flöte Gans Gurke Hammer Hase Hemd Honig Horn Kamm Kanne Kette Knopf Kohl Kran Krebs
Kugel Leder Mais Mauer Mehl Mühle Muschel Nadel Nuss Ofen Palme Pfeife Pinsel Quelle Rabe Rakete Raupe Regal Rose Rübe Säge Schal Schere Schirm Seil
Socke Spinne Stall Tanne Teich Trommel Tulpe Vase Waage Wal Wiese Wurm Zaun Ziege Zwiebel`.split(/\s+/).filter(Boolean);

/** Draw n different words at random (not a guessable order). */
export function drawWords(n = 2, list = WORDS) {
  const out = new Set(), r = new Uint32Array(1);
  while (out.size < Math.min(n, list.length)) { globalThis.crypto.getRandomValues(r); out.add(list[r[0] % list.length]); }
  return [...out];
}
