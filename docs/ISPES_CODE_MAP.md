# ISPES — מפת קוד קיימת (`orbitalMonitor.ts`)

מסמך מיפוי לשלב א׳ של ההמרה המבצעית. אין כאן שינוי UI.  
**יעד:** לזהות אחריות, לתעד תלות, ולהכוון פירוק ל־Core / Modules / UI.

---

## סיכום קצר

| תחום | תיאור | היכן בקוד (קבוצות פונקציות / משתנים) |
|------|--------|--------------------------------------|
| **ליבה / תיאום** | פאזה intro/space, לולאת `step`, `resize`, חיבור מסך↔סימולציה | `phase`, `goSpace`, `finishGoSpaceHandoff`, `step`, `restart`, `mount` |
| **סימולציה** | גופים, כוכבים, פיזיקה בסיסית, הגבלות מהירות | `spawnAsteroids`, `initStars`, `applySelfDestructVelocity`, `checkSurfaceImpact`, קבועי `MAX_PHYS_SUBSTEP` |
| **איתור / יצירת עצמים** | ספאון, ייעוד NEO, גאומטריית גוף | `spawnAsteroids`, `reserveUniqueDesignations`, `randomBodyGeometry`, `loadPersistedLightId` |
| **איום** | מסלול, מסדרון, TTI, ניתוח איום לטבלה | `timeToEarthImpact`, `findPrimaryEarthCollisionThreat`, `analyzeThreat`, `trajectoryClearedImmediateThreat` |
| **הגנה / אזור בטוח** | כדור הארץ כמוקד, גלי מגנטוספירה, מודלי הצלה | `applyMagnetosphericWave`, `executeMagneticWavePulse`, `deployMagneticWave`, `EARTH_R`, מצבי shield/pulse |
| **תיעוד / אירועים** | מודלים, טקסטי פגיעה, דוחות (חלקית ב־DOM) | `ImpactSnapshot`, `RescueReport`, `openImpactModal`, `openRescueModal`, `buildFalloutZones` |
| **מעקב / מיקום** | מיקום רציף, ציור מרחב, מיקוד Earth | `drawSpace`, `earthX`/`earthY`, עדכון מיקום ב־`step` |
| **תצוגה / UI** | Canvas, טבלה, fleet, מודלים, שער HACHAL, מדריך | `draw*`, `updateTable`, `mountApplication`, `showHachalGate`, `mountOrbitalTutorial` |
| **State** | משתני מודול גלובליים רבים | `asteroids`, `magical`, `simTimeScale`, `simulationPaused`, refs ל־DOM |
| **Storage** | session/local למפתחות HACHAL, מדריך, ייעודים, צבעי מסלול | `sessionStorage` / `localStorage` סביב `HACHAL_*`, `TUTORIAL_*`, `USED_DESIGNATIONS_*` |
| **התראות** | באנר התנגשות, עדכון fleet readout | `updateCollisionAlertBanner`, `updateFleetReadout` |

---

## זרימת ריצה נוכחית (לפני Core פורמלי)

1. `startOrbitalMonitor` → `mount` → `showHachalGate` / `mountApplication`  
2. `requestAnimationFrame` + `step` → עדכון פיזיקה → `drawIntro` | `drawSpace`  
3. איום: לולאות על `asteroids` + `findPrimaryEarthCollisionThreat` / `analyzeThreat`  
4. DOM: `updateTable`, באנרים, מודלים (חלק עם `innerHTML`)

---

## יעדי פירוק (המשך עבודה)

- **בוצע (גל ISPES ראשון):**
  - `src/types/domain.ts` — טיפוסי דומיין מרכזיים.
  - `src/constants/simulation.ts` — קבועי פיזיקה/תצוגה ששימשו בראש הקובץ המונוליתי.
  - `src/modules/threat/` — `physics.ts`, `collisionThreat.ts`, `analyzeThreat.ts` (איום, TTI, ניתוח מסדרון).
  - `src/core/MissionSystemCore.ts` + `src/app/bootstrap.ts` — נקודת כניסה דקה; `main.ts` קורא ל־`bootstrapMissionSystem()`.
  - תיקיות placeholder: `detection`, `protection`, `intelligence`, `tracking`, `services`, `storage`.
  - `npm run verify` — `typecheck` + `build`.
- **נשאר ב־`orbitalMonitor.ts` זמנית:** ציור canvas, mounting DOM, שער HACHAL, מדריך, סימולציה ו־state גלובלי — יעברו הדרגתית ל־Core / מודולים / UI.

---

## קבצים חדשים (מבנה ISPES)

```
src/core/MissionSystemCore.ts   — תיאום כניסה (כיום מפנה ללגאסי)
src/app/bootstrap.ts
src/types/domain.ts
src/constants/simulation.ts
src/modules/threat/*.ts
src/modules/detection/index.ts  — placeholder
src/modules/protection/index.ts
src/modules/intelligence/index.ts
src/modules/tracking/index.ts
src/services/index.ts
src/storage/index.ts
```

עדכן מסמך זה בכל פסיעת פירוק משמעותית.
