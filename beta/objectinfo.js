"use strict";
/*
 * AstroFly – Objekt-Erkennung & Fakten
 * ------------------------------------
 * Identifiziert die Objekte im Bildfeld über die SIMBAD-Datenbank (CDS) und
 * reichert die bekannten Klassiker mit kuratierten Fakten an (Entfernung,
 * Größe, Sternanzahl, Alter). Es werden nur Himmelskoordinaten übertragen.
 */

// Kuratierte Fakten für beliebte Objekte. Schlüssel = normalisierte SIMBAD-Id
// (Leerzeichen entfernt, Großbuchstaben). Texte pro Sprache.
const OBJECT_FACTS = {
  "M31": { de: { name: "Andromedagalaxie", type: "Spiralgalaxie", dist: "2,5 Mio. Lichtjahre", size: "≈ 152.000 Lichtjahre", stars: "≈ 1 Billion", age: "≈ 10 Mrd. Jahre" },
           en: { name: "Andromeda Galaxy", type: "Spiral galaxy", dist: "2.5 million light-years", size: "≈ 152,000 light-years", stars: "≈ 1 trillion", age: "≈ 10 billion years" } },
  "M32": { de: { name: "Begleiter von M31", type: "Zwerggalaxie", dist: "2,65 Mio. Lichtjahre", size: "≈ 6.500 Lichtjahre", stars: "≈ 3 Milliarden" },
           en: { name: "Companion of M31", type: "Dwarf galaxy", dist: "2.65 million light-years", size: "≈ 6,500 light-years", stars: "≈ 3 billion" } },
  "M110": { de: { name: "Begleiter von M31", type: "Zwerggalaxie", dist: "2,7 Mio. Lichtjahre", size: "≈ 15.000 Lichtjahre", stars: "≈ 10 Milliarden" },
            en: { name: "Companion of M31", type: "Dwarf galaxy", dist: "2.7 million light-years", size: "≈ 15,000 light-years", stars: "≈ 10 billion" } },
  "M33": { de: { name: "Dreiecksgalaxie", type: "Spiralgalaxie", dist: "2,73 Mio. Lichtjahre", size: "≈ 60.000 Lichtjahre", stars: "≈ 40 Milliarden" },
           en: { name: "Triangulum Galaxy", type: "Spiral galaxy", dist: "2.73 million light-years", size: "≈ 60,000 light-years", stars: "≈ 40 billion" } },
  "M42": { de: { name: "Orionnebel", type: "Emissionsnebel (Sternentstehung)", dist: "≈ 1.350 Lichtjahre", size: "≈ 24 Lichtjahre", stars: "≈ 2.000 junge Sterne", age: "< 3 Mio. Jahre" },
           en: { name: "Orion Nebula", type: "Emission nebula (star formation)", dist: "≈ 1,350 light-years", size: "≈ 24 light-years", stars: "≈ 2,000 young stars", age: "< 3 million years" } },
  "M45": { de: { name: "Plejaden", type: "Offener Sternhaufen", dist: "≈ 444 Lichtjahre", size: "≈ 15 Lichtjahre", stars: "≈ 1.000", age: "≈ 100 Mio. Jahre" },
           en: { name: "Pleiades", type: "Open star cluster", dist: "≈ 444 light-years", size: "≈ 15 light-years", stars: "≈ 1,000", age: "≈ 100 million years" } },
  "M13": { de: { name: "Herkuleshaufen", type: "Kugelsternhaufen", dist: "≈ 22.000 Lichtjahre", size: "≈ 145 Lichtjahre", stars: "≈ 300.000", age: "≈ 11,6 Mrd. Jahre" },
           en: { name: "Hercules Cluster", type: "Globular cluster", dist: "≈ 22,000 light-years", size: "≈ 145 light-years", stars: "≈ 300,000", age: "≈ 11.6 billion years" } },
  "M8": { de: { name: "Lagunennebel", type: "Emissionsnebel", dist: "≈ 4.100 Lichtjahre", size: "≈ 110 Lichtjahre" },
          en: { name: "Lagoon Nebula", type: "Emission nebula", dist: "≈ 4,100 light-years", size: "≈ 110 light-years" } },
  "M16": { de: { name: "Adlernebel", type: "Emissionsnebel (Säulen der Schöpfung)", dist: "≈ 5.700 Lichtjahre", size: "≈ 70 Lichtjahre", age: "≈ 5,5 Mio. Jahre" },
           en: { name: "Eagle Nebula", type: "Emission nebula (Pillars of Creation)", dist: "≈ 5,700 light-years", size: "≈ 70 light-years", age: "≈ 5.5 million years" } },
  "M17": { de: { name: "Omeganebel", type: "Emissionsnebel", dist: "≈ 5.500 Lichtjahre", size: "≈ 15 Lichtjahre" },
           en: { name: "Omega Nebula", type: "Emission nebula", dist: "≈ 5,500 light-years", size: "≈ 15 light-years" } },
  "M20": { de: { name: "Trifidnebel", type: "Emissions- und Reflexionsnebel", dist: "≈ 4.100 Lichtjahre", size: "≈ 40 Lichtjahre" },
           en: { name: "Trifid Nebula", type: "Emission & reflection nebula", dist: "≈ 4,100 light-years", size: "≈ 40 light-years" } },
  "M27": { de: { name: "Hantelnebel", type: "Planetarischer Nebel", dist: "≈ 1.360 Lichtjahre", size: "≈ 1,4 Lichtjahre", age: "≈ 10.000 Jahre" },
           en: { name: "Dumbbell Nebula", type: "Planetary nebula", dist: "≈ 1,360 light-years", size: "≈ 1.4 light-years", age: "≈ 10,000 years" } },
  "M51": { de: { name: "Strudelgalaxie", type: "Spiralgalaxie (wechselwirkend)", dist: "≈ 28 Mio. Lichtjahre", size: "≈ 77.000 Lichtjahre", stars: "≈ 100 Milliarden" },
           en: { name: "Whirlpool Galaxy", type: "Interacting spiral galaxy", dist: "≈ 28 million light-years", size: "≈ 77,000 light-years", stars: "≈ 100 billion" } },
  "M57": { de: { name: "Ringnebel", type: "Planetarischer Nebel", dist: "≈ 2.570 Lichtjahre", size: "≈ 1 Lichtjahr" },
           en: { name: "Ring Nebula", type: "Planetary nebula", dist: "≈ 2,570 light-years", size: "≈ 1 light-year" } },
  "M63": { de: { name: "Sonnenblumengalaxie", type: "Spiralgalaxie", dist: "≈ 27 Mio. Lichtjahre", size: "≈ 98.000 Lichtjahre" },
           en: { name: "Sunflower Galaxy", type: "Spiral galaxy", dist: "≈ 27 million light-years", size: "≈ 98,000 light-years" } },
  "M81": { de: { name: "Bodes Galaxie", type: "Spiralgalaxie", dist: "≈ 12 Mio. Lichtjahre", size: "≈ 90.000 Lichtjahre", stars: "≈ 250 Milliarden" },
           en: { name: "Bode's Galaxy", type: "Spiral galaxy", dist: "≈ 12 million light-years", size: "≈ 90,000 light-years", stars: "≈ 250 billion" } },
  "M82": { de: { name: "Zigarrengalaxie", type: "Starburst-Galaxie", dist: "≈ 12 Mio. Lichtjahre", size: "≈ 37.000 Lichtjahre" },
           en: { name: "Cigar Galaxy", type: "Starburst galaxy", dist: "≈ 12 million light-years", size: "≈ 37,000 light-years" } },
  "M101": { de: { name: "Feuerradgalaxie", type: "Spiralgalaxie", dist: "≈ 21 Mio. Lichtjahre", size: "≈ 170.000 Lichtjahre", stars: "≈ 1 Billion" },
            en: { name: "Pinwheel Galaxy", type: "Spiral galaxy", dist: "≈ 21 million light-years", size: "≈ 170,000 light-years", stars: "≈ 1 trillion" } },
  "M104": { de: { name: "Sombrerogalaxie", type: "Spiralgalaxie", dist: "≈ 31 Mio. Lichtjahre", size: "≈ 50.000 Lichtjahre" },
            en: { name: "Sombrero Galaxy", type: "Spiral galaxy", dist: "≈ 31 million light-years", size: "≈ 50,000 light-years" } },
  "M106": { de: { name: "M 106", type: "Spiralgalaxie", dist: "≈ 23 Mio. Lichtjahre", size: "≈ 135.000 Lichtjahre" },
            en: { name: "M 106", type: "Spiral galaxy", dist: "≈ 23 million light-years", size: "≈ 135,000 light-years" } },
  "NGC7000": { de: { name: "Nordamerikanebel", type: "Emissionsnebel", dist: "≈ 2.600 Lichtjahre", size: "≈ 100 Lichtjahre" },
               en: { name: "North America Nebula", type: "Emission nebula", dist: "≈ 2,600 light-years", size: "≈ 100 light-years" } },
  "IC5070": { de: { name: "Pelikannebel", type: "Emissionsnebel", dist: "≈ 2.600 Lichtjahre", size: "≈ 30 Lichtjahre" },
              en: { name: "Pelican Nebula", type: "Emission nebula", dist: "≈ 2,600 light-years", size: "≈ 30 light-years" } },
  "IC1805": { de: { name: "Herznebel", type: "Emissionsnebel", dist: "≈ 7.500 Lichtjahre", size: "≈ 200 Lichtjahre" },
              en: { name: "Heart Nebula", type: "Emission nebula", dist: "≈ 7,500 light-years", size: "≈ 200 light-years" } },
  "IC1848": { de: { name: "Seelennebel", type: "Emissionsnebel", dist: "≈ 7.500 Lichtjahre", size: "≈ 150 Lichtjahre" },
              en: { name: "Soul Nebula", type: "Emission nebula", dist: "≈ 7,500 light-years", size: "≈ 150 light-years" } },
  "NGC6960": { de: { name: "Sturmvogel (Cirrusnebel)", type: "Supernova-Überrest", dist: "≈ 2.400 Lichtjahre", size: "≈ 110 Lichtjahre", age: "≈ 10.000–20.000 Jahre" },
               en: { name: "Western Veil Nebula", type: "Supernova remnant", dist: "≈ 2,400 light-years", size: "≈ 110 light-years", age: "≈ 10,000–20,000 years" } },
  "NGC6992": { de: { name: "Cirrusnebel (Ost)", type: "Supernova-Überrest", dist: "≈ 2.400 Lichtjahre", size: "≈ 110 Lichtjahre", age: "≈ 10.000–20.000 Jahre" },
               en: { name: "Eastern Veil Nebula", type: "Supernova remnant", dist: "≈ 2,400 light-years", size: "≈ 110 light-years", age: "≈ 10,000–20,000 years" } },
  "NGC6995": { de: { name: "Fledermausnebel (Cirrus Ost)", type: "Supernova-Überrest (Teil des Cygnusbogens)", dist: "≈ 2.400 Lichtjahre", age: "≈ 10.000–20.000 Jahre" },
               en: { name: "Bat Nebula (Eastern Veil)", type: "Supernova remnant (part of the Cygnus Loop)", dist: "≈ 2,400 light-years", age: "≈ 10,000–20,000 years" } },
  "NGC2237": { de: { name: "Rosettennebel", type: "Emissionsnebel", dist: "≈ 5.200 Lichtjahre", size: "≈ 130 Lichtjahre" },
               en: { name: "Rosette Nebula", type: "Emission nebula", dist: "≈ 5,200 light-years", size: "≈ 130 light-years" } },
  "NGC869": { de: { name: "h Persei (Doppelhaufen)", type: "Offener Sternhaufen", dist: "≈ 7.500 Lichtjahre", stars: "≈ 300", age: "≈ 14 Mio. Jahre" },
              en: { name: "h Persei (Double Cluster)", type: "Open star cluster", dist: "≈ 7,500 light-years", stars: "≈ 300", age: "≈ 14 million years" } },
  "NGC884": { de: { name: "χ Persei (Doppelhaufen)", type: "Offener Sternhaufen", dist: "≈ 7.500 Lichtjahre", stars: "≈ 300", age: "≈ 14 Mio. Jahre" },
              en: { name: "χ Persei (Double Cluster)", type: "Open star cluster", dist: "≈ 7,500 light-years", stars: "≈ 300", age: "≈ 14 million years" } },
  "NGC7635": { de: { name: "Blasennebel", type: "Emissionsnebel", dist: "≈ 7.100 Lichtjahre", size: "≈ 7 Lichtjahre" },
               en: { name: "Bubble Nebula", type: "Emission nebula", dist: "≈ 7,100 light-years", size: "≈ 7 light-years" } },
  "NGC281": { de: { name: "Pacman-Nebel", type: "Emissionsnebel", dist: "≈ 9.500 Lichtjahre", size: "≈ 48 Lichtjahre" },
              en: { name: "Pacman Nebula", type: "Emission nebula", dist: "≈ 9,500 light-years", size: "≈ 48 light-years" } },
  "IC434": { de: { name: "Pferdekopfnebel-Region", type: "Emissionsnebel mit Dunkelwolke B33", dist: "≈ 1.400 Lichtjahre", size: "≈ 3,5 Lichtjahre (Pferdekopf)" },
             en: { name: "Horsehead Nebula region", type: "Emission nebula with dark cloud B33", dist: "≈ 1,400 light-years", size: "≈ 3.5 light-years (Horsehead)" } },
  "IC443": { de: { name: "Quallennebel", type: "Supernova-Überrest", dist: "≈ 5.000 Lichtjahre", size: "≈ 70 Lichtjahre" },
             en: { name: "Jellyfish Nebula", type: "Supernova remnant", dist: "≈ 5,000 light-years", size: "≈ 70 light-years" } },
  "NGC7023": { de: { name: "Irisnebel", type: "Reflexionsnebel", dist: "≈ 1.300 Lichtjahre", size: "≈ 6 Lichtjahre" },
               en: { name: "Iris Nebula", type: "Reflection nebula", dist: "≈ 1,300 light-years", size: "≈ 6 light-years" } },
  "SH2-132": { de: { name: "Löwennebel", type: "Emissionsnebel (HII-Region)", dist: "≈ 10.000 Lichtjahre", size: "≈ 180 Lichtjahre", stars: "u. a. zwei Wolf-Rayet-Sterne" },
               en: { name: "Lion Nebula", type: "Emission nebula (H II region)", dist: "≈ 10,000 light-years", size: "≈ 180 light-years", stars: "incl. two Wolf-Rayet stars" } },
  "SH2-101": { de: { name: "Tulpennebel", type: "Emissionsnebel", dist: "≈ 6.000 Lichtjahre", size: "≈ 70 Lichtjahre" },
               en: { name: "Tulip Nebula", type: "Emission nebula", dist: "≈ 6,000 light-years", size: "≈ 70 light-years" } },
  "SH2-155": { de: { name: "Höhlennebel", type: "Emissionsnebel", dist: "≈ 2.400 Lichtjahre", size: "≈ 35 Lichtjahre" },
               en: { name: "Cave Nebula", type: "Emission nebula", dist: "≈ 2,400 light-years", size: "≈ 35 light-years" } },
  "SH2-129": { de: { name: "Fledermaus-Flugnebel", type: "Emissionsnebel (mit OU4-Kalmar)", dist: "≈ 1.300 Lichtjahre" },
               en: { name: "Flying Bat Nebula", type: "Emission nebula (with the OU4 Squid)", dist: "≈ 1,300 light-years" } },
  "SH2-240": { de: { name: "Simeis 147 (Spaghettinebel)", type: "Supernova-Überrest", dist: "≈ 3.000 Lichtjahre", size: "≈ 150 Lichtjahre", age: "≈ 40.000 Jahre" },
               en: { name: "Simeis 147 (Spaghetti Nebula)", type: "Supernova remnant", dist: "≈ 3,000 light-years", size: "≈ 150 light-years", age: "≈ 40,000 years" } },
};

// SIMBAD-Objekttypen -> Anzeigename (für Objekte ohne kuratierten Eintrag)
const OTYPE_NAMES = {
  de: { G: "Galaxie", AGN: "Galaxie (aktiver Kern)", SyG: "Seyfert-Galaxie", Sy1: "Seyfert-Galaxie", Sy2: "Seyfert-Galaxie", EmG: "Galaxie", SBG: "Starburst-Galaxie", GiG: "Galaxie", GiP: "Galaxie", LIN: "Galaxie", IG: "Galaxie", GlC: "Kugelsternhaufen", OpC: "Offener Sternhaufen", "Cl*": "Sternhaufen", HII: "Emissionsnebel", SNR: "Supernova-Überrest", PN: "Planetarischer Nebel", RNe: "Reflexionsnebel", ISM: "Nebel", Neb: "Nebel", sh: "Nebel (Gasschale)", MoC: "Molekülwolke", DNe: "Dunkelnebel", EmO: "Emissionsobjekt", glb: "Globule", SFR: "Sternentstehungsregion",
        "WR*": "Wolf-Rayet-Stern", "SB*": "Doppelstern", "V*": "Veränderlicher Stern",
        "*": "Stern", "s*b": "Blauer Überriese", "s*r": "Roter Überriese",
        "s*y": "Gelber Überriese", "Em*": "Emissionslinien-Stern", "Be*": "Be-Stern",
        "RG*": "Roter Riese", "C*": "Kohlenstoffstern", "cC*": "Cepheid",
        "Y*O": "Junger Stern", "Or*": "Junger Stern (Orion-Typ)", "TT*": "T-Tauri-Stern",
        "Pe*": "Besonderer Stern", "bC*": "Beta-Cephei-Stern", "PM*": "Stern" },
  en: { G: "Galaxy", AGN: "Galaxy (active nucleus)", SyG: "Seyfert galaxy", Sy1: "Seyfert galaxy", Sy2: "Seyfert galaxy", EmG: "Galaxy", SBG: "Starburst galaxy", GiG: "Galaxy", GiP: "Galaxy", LIN: "Galaxy", IG: "Galaxy", GlC: "Globular cluster", OpC: "Open cluster", "Cl*": "Star cluster", HII: "Emission nebula", SNR: "Supernova remnant", PN: "Planetary nebula", RNe: "Reflection nebula", ISM: "Nebula", Neb: "Nebula", sh: "Nebula (gas shell)", MoC: "Molecular cloud", DNe: "Dark nebula", EmO: "Emission object", glb: "Globule", SFR: "Star-forming region",
        "WR*": "Wolf-Rayet star", "SB*": "Binary star", "V*": "Variable star",
        "*": "Star", "s*b": "Blue supergiant", "s*r": "Red supergiant",
        "s*y": "Yellow supergiant", "Em*": "Emission-line star", "Be*": "Be star",
        "RG*": "Red giant", "C*": "Carbon star", "cC*": "Cepheid",
        "Y*O": "Young stellar object", "Or*": "Young star (Orion type)", "TT*": "T Tauri star",
        "Pe*": "Peculiar star", "bC*": "Beta Cephei star", "PM*": "Star" },
};
// Für die Katalog-Erkennung (M/NGC/IC/Sh2) interessante Typen. Bewusst NICHT
// aus OTYPE_NAMES abgeleitet: dort stehen auch Stern-Typen für die Anzeige,
// Einzelsterne aus Katalogen (z. B. "NGC 7235 8") sollen hier NICHT durch
const INTERESTING_OTYPES = new Set(["G", "AGN", "SyG", "Sy1", "Sy2", "EmG",
  "SBG", "GiG", "GiP", "LIN", "IG", "GlC", "OpC", "Cl*", "HII", "SNR", "PN",
  "RNe", "ISM", "Neb", "sh", "MoC", "DNe", "EmO", "glb", "SFR"]);

// Kuratierte Regionen/Komplexe: Sobald genug Mitglieder im Feld erkannt
// werden, beschreibt die Infokarte den Gesamtkomplex - die Beschriftungen
// zeigen weiter die Einzelteile. "single" = schon EIN Teil genügt (die Teile
// sind Fragmente desselben physischen Objekts, z. B. Cygnusbogen: oft ist
// nur die halbe Region im Bild, gemeint ist trotzdem der Komplex).
const OBJECT_REGIONS = [
  { id: "NGC 6960/92/95", single: true, otype: "SNR",
    members: ["NGC6960", "NGC6992", "NGC6995", "NGC6974", "NGC6979", "IC1340"],
    de: { name: "Cirrusnebel (Cygnusbogen)", type: "Supernova-Überrest (Gesamtkomplex)", dist: "≈ 2.400 Lichtjahre", size: "≈ 110 Lichtjahre", age: "≈ 10.000–20.000 Jahre" },
    en: { name: "Veil Nebula (Cygnus Loop)", type: "Supernova remnant (full complex)", dist: "≈ 2,400 light-years", size: "≈ 110 light-years", age: "≈ 10,000–20,000 years" } },
  { id: "NGC 7000 / IC 5070", otype: "HII",
    members: ["NGC7000", "IC5070"],
    de: { name: "Nordamerika- & Pelikannebel", type: "Emissionsnebel-Komplex", dist: "≈ 2.600 Lichtjahre", size: "≈ 140 Lichtjahre" },
    en: { name: "North America & Pelican Nebulae", type: "Emission nebula complex", dist: "≈ 2,600 light-years", size: "≈ 140 light-years" } },
  { id: "IC 1805 / IC 1848", otype: "HII",
    members: ["IC1805", "IC1848"],
    de: { name: "Herz- & Seelennebel", type: "Emissionsnebel-Komplex", dist: "≈ 7.500 Lichtjahre", size: "≈ 300 Lichtjahre" },
    en: { name: "Heart & Soul Nebulae", type: "Emission nebula complex", dist: "≈ 7,500 light-years", size: "≈ 300 light-years" } },
  { id: "NGC 869/884", otype: "OpC",
    members: ["NGC869", "NGC884"],
    de: { name: "h & χ Persei (Doppelhaufen)", type: "Offene Sternhaufen", dist: "≈ 7.500 Lichtjahre", stars: "≈ 600", age: "≈ 14 Mio. Jahre" },
    en: { name: "Double Cluster (h & χ Persei)", type: "Open clusters", dist: "≈ 7,500 light-years", stars: "≈ 600", age: "≈ 14 million years" } },
];

/** Passende Region zu den erkannten Objekten (oder null). */
function findObjectRegion(items) {
  const ids = new Set(items.map((it) => normObjId(it.id)));
  for (const reg of OBJECT_REGIONS) {
    const n = reg.members.filter((m) => ids.has(m)).length;
    if (n >= (reg.single ? 1 : 2)) return reg;
  }
  return null;
}

/**
 * TAP-Abfrage mit Wiederholung: Die CDS-Dienste (SIMBAD/VizieR) haben
 * gelegentlich kurze Aussetzer (z. B. 503). Zweimal mit Pause erneut
 * versuchen und Server-Fehler von echten Verbindungsproblemen unterscheiden
 * (err.server = true -> Server antwortet, aber mit Fehlerstatus).
 */
async function fetchTapCsv(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * i));
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.text();
      lastErr = Object.assign(new Error("HTTP " + resp.status), { server: true, status: resp.status });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function normObjId(id) {
  return id.replace(/\s+/g, "").toUpperCase();
}

/** Hübsche Kurzform der SIMBAD-Id ("M  31" -> "M31" -> "M 31"). */
function prettyObjId(id) {
  const n = normObjId(id);
  const m = n.match(/^(M|NGC|IC)(\d+.*)$/);
  if (m) return `${m[1]} ${m[2]}`;
  const sh = n.match(/^SH2-(\d+.*)$/); // Sharpless-Katalog ("SH  2-132" -> "Sh2-132")
  return sh ? `Sh2-${sh[1]}` : id.replace(/\s+/g, " ").trim();
}

/** Eine CSV-Zeile in Felder zerlegen (Anführungszeichen überall erlaubt). */
function csvFields(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length && line[end] !== '"') end++;
      out.push(line.slice(i + 1, end));
      i = end + 2; // schließendes " + Komma
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) end = line.length;
      out.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

// Winkelgrößen (Bogenminuten) der kuratierten Klassiker als Ersatz, wenn
// SIMBAD keine galdim-Abmessung führt (z. B. NGC 7000) - sonst würde das
// Hauptobjekt des Bildes gar nicht erst gefunden
const OBJ_ARCMIN = {
  M31: 190, M32: 8.7, M110: 22, M33: 71, M42: 85, M45: 110, M13: 20,
  M8: 90, M16: 70, M17: 11, M20: 28, M27: 8, M51: 11, M57: 1.4, M63: 12.6,
  M81: 27, M82: 11, M101: 28.8, M104: 8.7, M106: 18.6,
  NGC7000: 120, IC5070: 60, IC1805: 60, IC1848: 60, NGC6960: 70,
  NGC6992: 60, NGC6995: 12, NGC2237: 80, NGC869: 30, NGC884: 30, NGC7635: 15,
  NGC281: 35, IC434: 60, IC443: 50, NGC7023: 18,
  // Orion-Feld (Demobild): SIMBAD führt hier keine Winkelgrößen
  M43: 20, NGC1977: 20, NGC1980: 14, NGC1981: 25, NGC1999: 2,
  // Sharpless-Nebel (SIMBAD ohne galdim)
  "SH2-132": 70, "SH2-101": 20, "SH2-155": 50, "SH2-129": 140, "SH2-240": 180,
  // Cygnus-Feld: SIMBAD fuehrt hier durchweg keine Winkelgroessen. NGC 6888
  // ist dort sogar nur ein Alias des Zentralsterns (WR 136) - ohne diesen
  // Eintrag faellt der Crescent-Nebel komplett aus der Auswahl
  NGC6888: 18, "SH2-108": 90, IC1318: 100, "SH2-105": 18, "SH2-106": 3,
  "SH2-109": 40, "SH2-104": 7, NGC6914: 6, NGC6910: 10, IC4996: 3.4, M29: 12.7,
};

/**
 * SIMBAD-Kegelabfrage: größere Objekte im Feld (CSV, CORS-frei).
 * Viele bekannte Objekte heißen in SIMBAD primär nach ihrem Eigennamen
 * (NGC 7000 = "NAME North America Nebula") - deshalb wird die Katalog-
 * Nummer über die Alias-Tabelle (ident) mitgeliefert und pro Objekt der
 * beste Katalogname gewählt (Messier vor NGC vor IC).
 * Hinweise: ORDER BY verträgt beim SIMBAD-Parser keine Tabellen-Präfixe
 * (daher der Spalten-Alias), und galdim darf NULL sein - die Größe wird
 * dann aus OBJ_ARCMIN ergänzt.
 */
// Ausgedehnte Objekte (Nebel, Haufen, Galaxien). Der Typ-Filter haelt die
// Einzelsterne aus dem Ergebnis: in dichten Milchstrassenfeldern tragen
// tausende Haufenmitglieder Namen wie "NGC 6910 12" und fuellten bisher das
// gesamte Zeilenlimit, so dass die eigentlichen Nebel nie ankamen.
const EXT_OTYPES = "'HII','SNR','PN','RNe','DNe','GNe','ISM','Cld','MoC','sh'," +
  "'OpC','GlC','Cl*','As*','G','GiG','GiC','IG','AGN','Sy1','Sy2','LIN'," +
  "'SBG','EmG','rG','bub','SFR','out','HH','Y*O','C?*','PoC','MGr'";

// Nebel, die in SIMBAD keinen eigenen Eintrag haben, sondern als Alias ihres
// Zentralsterns gefuehrt werden (typisch fuer Wolf-Rayet-Ringnebel)
const STAR_NAMED_NEBULAE = ["NGC 6888", "NGC 2359", "NGC 3199", "SH 2-308"];

/** Ein Alias zaehlt nur als Katalogobjekt, wenn nach der Nummer nichts
 *  Weiteres folgt: "NGC 6914b" ja, "IC 4996   10" (Haufenmitglied) nein. */
function isCatalogAlias(alias) {
  return /^(M|NGC|IC)\s+\d+[a-zA-Z]?$/.test(alias) ||
         /^SH\s+2-\d+[a-zA-Z]?$/.test(alias);
}

function simbadConeUrl(fields, ra, dec, radiusDeg, extra, top) {
  const adql = `SELECT TOP ${top} ${fields} ` +
    `FROM basic AS b JOIN ident AS i ON i.oidref = b.oid ` +
    `WHERE 1=CONTAINS(POINT('ICRS',b.ra,b.dec),` +
    `CIRCLE('ICRS',${ra.toFixed(6)},${dec.toFixed(6)},${radiusDeg.toFixed(4)})) ` +
    extra + ` ORDER BY majaxis DESC`;
  return "https://simbad.cds.unistra.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=" +
    encodeURIComponent(adql);
}

async function querySimbad(ra, dec, radiusDeg) {
  const fields = "b.main_id, b.ra, b.dec, b.otype_txt, b.galdim_majaxis AS majaxis, i.id";
  const catFilter = `AND (i.id LIKE 'M %' OR i.id LIKE 'NGC %' OR i.id LIKE 'IC %' ` +
    `OR i.id LIKE 'SH 2-%' OR i.id LIKE 'SH  2-%')`;
  // Zwei Runden: die breite Abfrage wie bisher (faengt auch Objekte mit
  // ungewoehnlichem Typ) und eine auf ausgedehnte Objekte beschraenkte,
  // damit Nebel nicht hinter Sternen aus dem Zeilenlimit fallen
  // Dritte Runde fuer Nebel, die SIMBAD unter ihrem Zentralstern fuehrt:
  // "NGC 6888" ist dort ein Alias des Wolf-Rayet-Sterns WR 136 und faellt
  // sonst zwischen den tausenden Sternen des Feldes durch
  const namedFilter = "AND (" + STAR_NAMED_NEBULAE
    .map((n) => `i.id LIKE '${n.replace(/\s+/g, "%")}'`).join(" OR ") + ")";
  const urls = [
    simbadConeUrl(fields, ra, dec, radiusDeg, catFilter, 120),
    simbadConeUrl(fields, ra, dec, radiusDeg,
      `AND b.otype_txt IN (${EXT_OTYPES}) ` + catFilter, 80),
    simbadConeUrl(fields, ra, dec, radiusDeg, namedFilter, 20),
  ];
  const parts = await Promise.all(urls.map((u) =>
    fetchTapCsv(u).then((r) => r, () => "")));
  const CAT_RANK = { M: 0, NGC: 1, IC: 2, "SH2-": 3 };
  const byMain = new Map(); // main_id -> Objekt mit bestem Katalog-Alias
  for (const part of parts) {
    const lines = part.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const f = csvFields(lines[i]);
      if (f.length < 6) continue;
      const mainId = f[0].trim(), alias = f[5].trim();
      const oRa = +f[1], oDec = +f[2], size = +f[4];
      const otype = f[3].replace(/"/g, "");
      if (!isFinite(oRa) || !isFinite(oDec)) continue;
      if (!isCatalogAlias(alias)) continue;
      const m = normObjId(alias).match(/^(M|NGC|IC|SH2-)\d/);
      if (!m) continue;
      const rank = CAT_RANK[m[1]];
      const prev = byMain.get(mainId);
      if (prev && prev.rank <= rank) continue;
      const fallback = OBJ_ARCMIN[normObjId(alias)] || 0;
      byMain.set(mainId, { id: alias, rank, main: mainId, ra: oRa, dec: oDec,
        otype, sizeArcmin: size > 0 ? size : fallback });
    }
  }
  const out = [...byMain.values()];
  out.sort((a, b) => b.sizeArcmin - a.sizeArcmin);
  return out;
}

/**
 * Markante Sterne im Feld: Wolf-Rayet-Sterne sowie helle Sterne mit
 * Eigennamen (V <= 4). Liefert { id, ra, dec, otype, star: true } -
 * dedupliziert nach Objekt, kürzester Alias gewinnt ("WR 153" statt
 * "WR 153ab"), "NAME "-Präfix wird entfernt ("Hatysa").
 */
async function querySimbadStars(ra, dec, radiusDeg) {
  const adql = `SELECT TOP 40 b.main_id, b.ra, b.dec, b.otype_txt, f.V AS vmag, i.id ` +
    `FROM basic AS b JOIN ident AS i ON i.oidref = b.oid ` +
    `LEFT JOIN allfluxes AS f ON f.oidref = b.oid ` +
    `WHERE 1=CONTAINS(POINT('ICRS',b.ra,b.dec),` +
    `CIRCLE('ICRS',${ra.toFixed(6)},${dec.toFixed(6)},${radiusDeg.toFixed(4)})) ` +
    `AND ((b.otype_txt = 'WR*' AND i.id LIKE 'WR %') ` +
    `OR (i.id LIKE 'NAME %' AND f.V <= 4.0)) ORDER BY vmag`;
  const url = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=" +
    encodeURIComponent(adql);
  const lines = (await fetchTapCsv(url)).trim().split("\n");
  const byMain = new Map();
  for (let i = 1; i < lines.length; i++) {
    const f = csvFields(lines[i]);
    if (f.length < 6) continue;
    const mainId = f[0].trim();
    const oRa = +f[1], oDec = +f[2];
    const otype = f[3].replace(/"/g, "");
    const alias = f[5].trim().replace(/^NAME\s+/, "").replace(/\s+/g, " ");
    if (!isFinite(oRa) || !isFinite(oDec)) continue;
    // Nur echte Sterne (Typ enthält *), keine Haufen/Assoziationen mit Eigennamen
    if (!/\*/.test(otype) || otype === "Cl*" || otype === "As*") continue;
    const prev = byMain.get(mainId);
    if (prev && prev.id.length <= alias.length) continue;
    byMain.set(mainId, { id: alias, main: mainId, ra: oRa, dec: oDec, otype, star: true });
  }
  return [...byMain.values()];
}

/**
 * Gaia-DR3-Astrophysik (GSP-Phot/FLAME) für markante Sterne: Radius in
 * Sonnenradien, Masse, Alter, Temperatur, Entfernung. Eine Abfrage für alle
 * Positionen; Ergebnis wird als star.phys angehängt, fehlende Werte bleiben
 * einfach weg (für sehr helle oder extreme Sterne führt Gaia oft nur Teile).
 */
async function queryStarParams(stars) {
  if (!stars.length) return;
  const circles = stars.map((s) =>
    `1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),CIRCLE('ICRS',${s.ra.toFixed(6)},${s.dec.toFixed(6)},0.0015))`);
  const adql = `SELECT TOP ${stars.length * 4} RA_ICRS, DE_ICRS, Teff, Dist, Rad, "Mass-Flame", "Age-Flame" ` +
    `FROM "I/355/paramp" WHERE ${circles.join(" OR ")}`;
  const url = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=" +
    encodeURIComponent(adql);
  const lines = (await fetchTapCsv(url)).trim().split("\n");
  for (let i = 1; i < lines.length; i++) {
    const f = csvFields(lines[i]);
    if (f.length < 7) continue;
    const ra = +f[0], dec = +f[1];
    if (!isFinite(ra) || !isFinite(dec)) continue;
    // dem nächstgelegenen angefragten Stern zuordnen (< 6 Bogensekunden)
    let best = null, bd = 0.0017 * 0.0017;
    for (const s of stars) {
      const dx = (s.ra - ra) * Math.cos(dec * Math.PI / 180), dy = s.dec - dec;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = s; }
    }
    if (!best || best.phys) continue;
    const num = (x) => (x !== "" && isFinite(+x) ? +x : null);
    best.phys = { teff: num(f[2]), distPc: num(f[3]), rad: num(f[4]),
      mass: num(f[5]), ageGyr: num(f[6]) };
  }
}

// ---- Formatierer für die Sternphysik (Label-Kurzform + Infokarte) ----

function fmtNum(x, lang) {
  return Math.round(x).toLocaleString(lang === "de" ? "de-DE" : "en-US");
}
function fmtRad(rad, lang) {
  if (rad >= 10) return String(Math.round(rad));
  const v = (Math.round(rad * 10) / 10).toString();
  return lang === "de" ? v.replace(".", ",") : v;
}
function fmtAge(gyr, lang, short) {
  if (gyr >= 1) {
    const v = (Math.round(gyr * 10) / 10).toLocaleString(lang === "de" ? "de-DE" : "en-US");
    if (short) return lang === "de" ? `${v} Mrd. J.` : `${v} Gyr`;
    return lang === "de" ? `\u2248 ${v} Mrd. Jahre` : `\u2248 ${v} billion years`;
  }
  const myr = Math.max(1, Math.round(gyr * 1000));
  if (short) return lang === "de" ? `${myr} Mio. J.` : `${myr} Myr`;
  return lang === "de" ? `\u2248 ${myr} Mio. Jahre` : `\u2248 ${myr} million years`;
}

/** Kurzzusatz fürs Feld-Label, z. B. " · ≈ 35× Sonne · 4 Mio. J." */
function starPhysShort(phys, lang) {
  if (!phys) return "";
  const bits = [];
  if (phys.rad) bits.push(`\u2248 ${fmtRad(phys.rad, lang)}\u00d7 ${lang === "de" ? "Sonne" : "Sun"}`);
  if (phys.ageGyr) bits.push(fmtAge(phys.ageGyr, lang, true));
  return bits.length ? " \u00b7 " + bits.join(" \u00b7 ") : "";
}

/** Infokarten-Fakten aus der Gaia-Astrophysik eines markanten Sterns. */
function starFacts(it) {
  if (!it || !it.phys) return null;
  const p = it.phys;
  const out = {};
  for (const lang of ["de", "en"]) {
    const f = { name: OTYPE_NAMES[lang][it.otype] || (lang === "de" ? "Stern" : "Star") };
    if (p.teff) f.type = lang === "de"
      ? `Oberfl\u00e4che \u2248 ${fmtNum(p.teff, lang)} K`
      : `Surface \u2248 ${fmtNum(p.teff, lang)} K`;
    if (p.distPc) f.dist = lang === "de"
      ? `\u2248 ${fmtNum(p.distPc * 3.262, lang)} Lichtjahre`
      : `\u2248 ${fmtNum(p.distPc * 3.262, lang)} light-years`;
    if (p.rad) f.radius = lang === "de"
      ? `\u2248 ${fmtRad(p.rad, lang)} Sonnenradien`
      : `\u2248 ${fmtRad(p.rad, lang)} solar radii`;
    if (p.mass) f.mass = lang === "de"
      ? `\u2248 ${fmtRad(p.mass, lang)} Sonnenmassen`
      : `\u2248 ${fmtRad(p.mass, lang)} solar masses`;
    if (p.ageGyr) f.age = fmtAge(p.ageGyr, lang, false);
    out[lang] = f;
  }
  return out;
}
