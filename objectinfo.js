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
};

// SIMBAD-Objekttypen -> Anzeigename (für Objekte ohne kuratierten Eintrag)
const OTYPE_NAMES = {
  de: { G: "Galaxie", AGN: "Galaxie (aktiver Kern)", SyG: "Seyfert-Galaxie", Sy1: "Seyfert-Galaxie", Sy2: "Seyfert-Galaxie", EmG: "Galaxie", SBG: "Starburst-Galaxie", GiG: "Galaxie", GiP: "Galaxie", LIN: "Galaxie", IG: "Galaxie", GlC: "Kugelsternhaufen", OpC: "Offener Sternhaufen", "Cl*": "Sternhaufen", HII: "Emissionsnebel", SNR: "Supernova-Überrest", PN: "Planetarischer Nebel", RNe: "Reflexionsnebel", ISM: "Nebel", Neb: "Nebel", MoC: "Molekülwolke", DNe: "Dunkelnebel", EmO: "Emissionsobjekt", glb: "Globule", SFR: "Sternentstehungsregion" },
  en: { G: "Galaxy", AGN: "Galaxy (active nucleus)", SyG: "Seyfert galaxy", Sy1: "Seyfert galaxy", Sy2: "Seyfert galaxy", EmG: "Galaxy", SBG: "Starburst galaxy", GiG: "Galaxy", GiP: "Galaxy", LIN: "Galaxy", IG: "Galaxy", GlC: "Globular cluster", OpC: "Open cluster", "Cl*": "Star cluster", HII: "Emission nebula", SNR: "Supernova remnant", PN: "Planetary nebula", RNe: "Reflection nebula", ISM: "Nebula", Neb: "Nebula", MoC: "Molecular cloud", DNe: "Dark nebula", EmO: "Emission object", glb: "Globule", SFR: "Star-forming region" },
};
const INTERESTING_OTYPES = new Set(Object.keys(OTYPE_NAMES.en));

function normObjId(id) {
  return id.replace(/\s+/g, "").toUpperCase();
}

/** Hübsche Kurzform der SIMBAD-Id ("M  31" -> "M31" -> "M 31"). */
function prettyObjId(id) {
  const n = normObjId(id);
  const m = n.match(/^(M|NGC|IC)(\d+.*)$/);
  return m ? `${m[1]} ${m[2]}` : id.replace(/\s+/g, " ").trim();
}

/** SIMBAD-Kegelabfrage: größere Objekte im Feld (CSV, CORS-frei). */
async function querySimbad(ra, dec, radiusDeg) {
  const adql = `SELECT TOP 40 main_id, ra, dec, otype_txt, galdim_majaxis FROM basic ` +
    `WHERE 1=CONTAINS(POINT('ICRS',ra,dec),` +
    `CIRCLE('ICRS',${ra.toFixed(6)},${dec.toFixed(6)},${radiusDeg.toFixed(4)})) ` +
    `AND galdim_majaxis IS NOT NULL ORDER BY galdim_majaxis DESC`;
  const url = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=" +
    encodeURIComponent(adql);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const lines = (await resp.text()).trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    // Einfaches CSV: erstes Feld kann in Anführungszeichen stehen
    let rest = lines[i], id = "";
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      id = rest.slice(1, end);
      rest = rest.slice(end + 2);
    } else {
      const c = rest.indexOf(",");
      id = rest.slice(0, c);
      rest = rest.slice(c + 1);
    }
    const p = rest.split(",");
    if (p.length < 4) continue;
    const oRa = +p[0], oDec = +p[1], size = +p[3];
    let otype = p[2].replace(/"/g, "");
    if (!isFinite(oRa) || !isFinite(oDec)) continue;
    out.push({ id: id.trim(), ra: oRa, dec: oDec, otype, sizeArcmin: isFinite(size) ? size : 0 });
  }
  return out;
}
