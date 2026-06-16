# spiseredskap.iverfinne.no

Rekonstruksjon av dei tre plansjane frå **P1. Spisereiskap for born** (GK4 AHO
Introduksjon Industridesign). Fotoet av kvart objekt er bytt ut med ein
interaktiv 3D-modell (`.glb`) som ein kan spinne på.

## Sider

| Side | Objekt | Modell |
| --- | --- | --- |
| `index.html` | E.T. | `models/krakefot.glb` |
| `tommel.html` | Tommel | `models/tommel.glb` |
| `tunge.html` | Tunge | `models/tunge.glb` |

## Layout

Kvar side har to nøye uttegna layoutar:

- **Landskap** – trufast rekonstruksjon av plansjen (tekst, spesifikasjonar,
  teikningar, vertikal margtekst og 3D-objektet i same posisjon som fotoet).
- **Ståande / mobil portrett** – innhaldet er omflytta: modellen ligg øvst som
  ein «hero», deretter tittel, brødtekst, spesifikasjonar og tekniske
  teikningar.

## Teknisk

- Rein statisk HTML/CSS – ingen byggjesteg.
- 3D vert vist med [`<model-viewer>`](https://modelviewer.dev), vendora lokalt i
  `js/model-viewer.min.js` slik at det fungerer utan tilgang til CDN.
- Modellane er ukomprimerte glTF (Tripo), så ingen Draco/KTX2-dekodar trengst.

### Køyre lokalt

```bash
npx http-server -p 8000 -c-1
# opne http://localhost:8000
```
