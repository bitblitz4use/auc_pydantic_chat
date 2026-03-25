# Bericht: Nichtkonformitäten aus der Context-Challenge

## Zweck dieses Berichts

Dieser Bericht ist eine **Prüfunterlage für Fach- und Management-Review**. Er fasst alle bewerteten Nichtkonformitäten mit Status `needs_improvement` zusammen und hilft bei der Frage:

**"Ist die Aussage des LLM mit der Quelle auf der genannten Seite nachvollziehbar?"**

- **Quelldokument:** `alpe_system_handbuch.pdf`
- **Referenzstandard:** `ÖNORM EN ISO 9001:2015`
- **Gesamtzahl Findings:** `43`
- **Abgedeckter Challenge-Status:** `needs_improvement`

## Schnellstart fuer nicht-technische Pruefer

### So pruefen Sie ein Finding in 4 Schritten

1. Gehen Sie zum passenden Abschnitt (`F01`, `F02`, ...).
2. Lesen Sie die Felder **Klausel**, **Warum (LLM)** und **Primaere Fundstelle**.
3. Oeffnen Sie im Quelldokument die in **Primaere Fundstelle** genannte Seite (`page_no`).
4. Pruefen Sie, ob der Seiteninhalt die LLM-Aussage wirklich traegt.

### Was bedeutet die Zeile "Primaere Fundstelle"?

Beispiel:

`heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

- `heading_path` = Abschnittsueberschrift im Quelldokument
- `page_no` = Seite im PDF, die Sie pruefen sollen

Hinweis: Fuer die manuelle Validierung sind **heading_path** und **page_no** die wichtigsten Angaben.

## Pruefentscheidung pro Finding (empfohlene Logik)

- **Validiert:** Die LLM-Begruendung wird auf der genannten Seite klar bestaetigt.
- **Teilweise validiert:** Einzelne Teile passen, aber wesentliche Aussagen fehlen.
- **Nicht validiert:** Die Seite stuetzt die LLM-Aussage nicht ausreichend.
- **Rueckfrage noetig:** Aussage oder Quelle ist mehrdeutig; Zusatznachweis erforderlich.

## Management-Ueberblick

### Kennzahlen

- **Findings nach Confidence**
  - `0.75`: `7` Findings
  - `0.70`: `30` Findings
  - `0.60`: `6` Findings
- **Durchschnittliche Confidence (alle Findings):** `0.694`
- **Hauptmuster:** Prozesse sind grundsaetzlich vorhanden, aber es fehlen oft klare und pruefbare Nachweise fuer die konkrete Klauselanforderung.

### Dominante Lueckenthemen

1. **Dokumentationsspezifitaet**
   - Es fehlen explizite Nachweise dazu, wer freigegeben hat, was geaendert wurde, wann ueberwacht wurde und welcher Nachweis die Erfuellung belegt.
2. **Planungs- und Steuerungsdetails**
   - Entwicklungsplanung, Verifizierung, Aenderungssteuerung und Zielplanung sind beschrieben, aber nicht ausreichend klauselspezifisch.
3. **Awareness und Kommunikation**
   - Fuer Qualitaetspolitik/-ziele sowie Kommunikationsregeln (`mit wem`, `worueber`) fehlen direkte operative Nachweise.
4. **Audit und Messtechnik**
   - Nachweise zum internen Auditprogramm und zur messtechnischen Rueckfuehrbarkeit sind nicht vollstaendig belegt.
5. **Vertraege und Kundenanforderungen**
   - Die Klaerung abweichender oder impliziter Kundenanforderungen ist nicht explizit nachgewiesen.

### Klausel-Hotspots (nach Anzahl)

- `8.3.2 Entwicklungsplanung`: `4`
- `8.2.3 Ueberpruefung der Anforderungen`: `3`
- `10.2 Nichtkonformitaet und Korrekturmassnahmen`: `3`
- `7.3 Bewusstsein`: `3`
- `9.1.1 Allgemeines`: `2`
- `9.2 Internes Audit`: `2`
- `8.5.1 Steuerung der Produktion/Dienstleistungserbringung`: `2`
- `8.3.6 Entwicklungsaenderungen`: `2`
- `7.1.5.2 Messtechnische Rueckfuehrbarkeit`: `2`
- `7.4 Kommunikation`: `2`
- `6.2 Qualitaetsziele und Planung`: `2`
- `4.3 Anwendungsbereich`: `2`
- `2 Normative Verweisungen`: `2`

### Wiederkehrendes Evidenzmuster

Ueber viele Findings hinweg stammen die Top-Chunks wiederholt aus:

- `2.4.4.1 KOMPETENZEN` (p.29/30)
- `2.8.3 PLANUNG VON AENDERUNGEN` (p.37)
- `2.2 FUEHRUNG` (p.14)
- `2.5.2 STEUERUNG EXTERN BEREITGESTELLTER PROZESSE...` (p.31)
- `3.3.6.x DOKUMENTATION/LENKUNG` (p.60-62)

Das deutet auf eine starke generische Management-Abdeckung hin, jedoch auf eine unzureichende klauselspezifische Evidenzverknuepfung fuer mehrere ISO-9001-Verpflichtungen.

## Priorisierter Massnahmen-Backlog (Vorschlag)

1. **Auditprogramm-Paket (9.2)**
   - Explizites Auditprogramm-Nachweispaket erstellen/anhaengen: Frequenz, Methoden, Kriterien, Verantwortlichkeiten, Ergebnisse, Aufbewahrung.
2. **Monitoring-/Messsteuerungs-Paket (9.1.1, 7.1.5.2)**
   - Explizite Matrizen ergaenzen fuer was/wann/wie gemessen wird, Pruefungen bei ungueltigen Messmitteln und erforderliche Korrekturmassnahmen.
3. **Entwicklungsplanungs-Paket (8.3.2/8.3.4/8.3.5/8.3.6)**
   - Vorlagen ergaenzen, die Phasen, Ressourcen, Verifizierungsnachweise, Annahmekriterien und Aenderungsautorisierung/Aufbewahrung belegen.
4. **Kommunikations- und Awareness-Paket (7.3/7.4/8.2.1)**
   - Rollenbasierte Kommunikationsmatrix und Awareness-Nachweise ergaenzen (Trainings-Logs, Bestaetigungen, Taktung).
5. **Governance-Paket dokumentierte Information (7.5.3, 8.5.6, 8.6, 8.7.2)**
   - Rueckverfolgbarkeitsfelder staerken: Identitaet Freigebender, Aenderungsergebnis, Nichtkonformitaetsdetail, Freigabeautoritaet.

## Hinweise zur Nutzung in Reviews

- Dieser Bericht zeigt die Bewertungen strukturiert als Pruefnachweis je Finding.
- Fuer belastbare Entscheidungen sollte je `ru_key` eine direkte Zuordnung gepflegt werden zu:
  - autoritativem Anforderungstext,
  - konkretem Evidenzauszug,
  - Gap-Statement,
  - Massnahmeverantwortung/Datum/Status.

## Detaillierte Pruefblaetter je Finding (alle 43)

> Jedes Pruefblatt enthaelt: `ru_key`, Klausel, Bewertung, Begruendung und eine primaere Fundstelle im Originaldokument (`heading_path`, `page_no`).

### F01
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/10-2-nichtkonformit-t-und-korrekturma-nahmen::ru::86dc04ac0e48`
- **Klausel:** `10.2 Nichtkonformität und Korrekturmaßnahmen`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, ob vergleichbare Nichtkonformitäten bestehen oder möglicherweise auftreten könnten.`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die Evidenz zeigt, dass die Organisation Prozesse zur Identifizierung und Handhabung von Nichtkonformitäten implementiert hat, jedoch fehlt die spezifische Nennung, dass vergleichbare Nichtkonformitäten regelmäßig bestimmt werden. Es wird auf kontinuierliche Verbesserung und das systematische Management von Nichtkonformitäten hingewiesen, jedoch sind die Verfahren ungenügend spezifiziert, um vollständige Konformität zu gewährleisten.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F02
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-5-3-lenkung-dokumentierter-information::ru::4091c1ddec17`
- **Klausel:** `7.5.3 Lenkung dokumentierter Information`
- **Anforderung (ru_statement):** `Dokumentierte Information externer Herkunft, die von der Organisation als notwendig für Planung und Betrieb des Qualitätsmanagementsystems bestimmt wurde, muss angemessen gekennzeichnet und gelenkt werden.`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die bereitgestellten Evidenzen zeigen, dass es Prozesse zur Kennzeichnung und Steuerung von Dokumenten gibt, jedoch sind spezifische Details zu externen Informationen, die als notwendig für den Betrieb des Qualitätsmanagementsystems definiert wurden, nicht ausreichend dokumentiert. Obwohl die Kennzeichnung von Originalen und nicht-gelenkten Kopien erwähnt wird, fehlen klare Richtlinien oder Prozesse für die systematische Handhabung und Kontrolle von externen Informationen.
- **Primaere Fundstelle:** `heading_path: 2.8.3. PLANUNG VON ÄNDERUNGEN | page_no: 37`

### F03
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-2-3-berpr-fung-der-anforderungen-f-r-produkte-und-dienstleistungen::ru::c40408a928a1`
- **Klausel:** `8.2.3 Überprüfung der Anforderungen für Produkte und Dienstleistungen`
- **Anforderung (ru_statement):** `Die Kundenanforderungen müssen vor der Annahme von der Organisation bestätigt werden, wenn der Kunde keine dokumentierte Angabe über seine Anforderungen macht.`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die Evidenz belegt, dass die Organisation Kundenanforderungen systematisch steuert und diese in den Verbesserungsprozess einfließen. Es fehlen jedoch spezifische Hinweise zur Bestätigung von Anforderungen, wenn diese nicht dokumentiert sind.
- **Primaere Fundstelle:** `heading_path: 3.2. UNSERE UNTERNEHMENSPOLITIK | page_no: 38`

### F04
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-5-1-steuerung-der-produktion-und-der-dienstleistungserbringung::ru::bd2f89f3158c`
- **Klausel:** `8.5.1 Steuerung der Produktion und der Dienstleistungserbringung`
- **Anforderung (ru_statement):** `Falls zutreffend, müssen beherrschte Bedingungen die Durchführung von Überwachungs- und Messtätigkeiten in geeigneten Phasen enthalten, um zu verifizieren, dass die Kriterien zur Steuerung von Prozessen oder Ergebnissen `
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Es gibt Hinweise auf Überwachungs- und Messtätigkeiten in verschiedenen Kontexten, jedoch fehlen konkrete Beispiele oder spezifische Details über die Umsetzung in den bereitgestellten Evidenzstücken. Die Informationsbasis reicht aus, um eine teilweise Einhaltung zu erkennen, aber es sind zusätzliche Informationen erforderlich, um eine vollständige Einhaltung zu bestätigen.
- **Primaere Fundstelle:** `heading_path: 3.3.12. A-012 ... REVIEW-PROZESS (MMR, IQA,...) | page_no: 80`

### F05
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/9-1-1-allgemeines::ru::2b46b77b9c3d`
- **Klausel:** `9.1.1 Allgemeines`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, was überwacht und gemessen werden muss.`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die bereitgestellten Nachweise deuten darauf hin, dass die Organisation Maßnahmen zur Überwachung und Messung implementiert hat, einschließlich der Überwachung von Prozessleistungen und der Durchführung von Risiko- und Chancenbewertungen. Allerdings sind keine spezifischen Elemente dokumentiert, die klar angeben, was genau überwacht und gemessen werden muss, um den Anforderungen des Standards vollständig zu entsprechen.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F06
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/9-2-internes-audit::ru::c74bc323c81b`
- **Klausel:** `9.2 Internes Audit`
- **Anforderung (ru_statement):** `Die Organisation muss ein oder mehrere Auditprogramme planen, aufbauen, verwirklichen und aufrechterhalten, einschließlich der Häufigkeit von Audits, Methoden, Verantwortlichkeiten, Anforderungen an die Planung sowie Ber`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die Organisation hat Mechanismen zur Planung und Kontrolle von Änderungen im Managementsystem, jedoch gibt es keine spezifischen Informationen über die Etablierung und Aufrechterhaltung eines Auditprogramms, das die erforderlichen Elemente wie Häufigkeit, Methoden und Verantwortlichkeiten beachtet. Die Evidenz bezieht sich zwar auf die Verantwortung und das Engagement der Führung, lässt jedoch vermissen, dass ein erklärtes Auditprogramm existiert und die dazugehörigen Anforderungen klar abgedeckt sind.
- **Primaere Fundstelle:** `heading_path: 2.8.3. PLANUNG VON ÄNDERUNGEN | page_no: 37`

### F07
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/a-4-risikobasiertes-denken::ru::c8b917a8acfe`
- **Klausel:** `A.4 Risikobasiertes Denken`
- **Anforderung (ru_statement):** `Die Organisation muss entscheiden, ob dokumentierte Informationen als Nachweis für die Bestimmung von Risiken aufzubewahren sind.`
- **Status:** `needs_improvement` | **Confidence:** `0.75`
- **Warum (LLM):** Die Organisation hat Prozesse zur Risikobewertung und der Sicherung von Informationen beschrieben, jedoch ist nicht eindeutig dokumentiert, ob spezielle Nachweise für die Bestimmung von Risiken aufbewahrt werden müssen. Es fehlt an klaren Aussagen dazu, dass dokumentierte Informationen explizit als Nachweis für die Bestimmung von Risiken physisch aufbewahrt werden sollen.
- **Primaere Fundstelle:** `heading_path: Die Rolle der Geschäftsführung in der IT-Governance | page_no: 85`

### F08
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/10-2-nichtkonformit-t-und-korrekturma-nahmen::ru::2e0dea88735d`
- **Klausel:** `10.2 Nichtkonformität und Korrekturmaßnahmen`
- **Anforderung (ru_statement):** `Korrekturmaßnahmen müssen den Auswirkungen der aufgetretenen Nichtkonformitäten angemessen sein.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Informationen deuten darauf hin, dass Korrekturmaßnahmen in Zusammenhang mit Nichtkonformitäten geregelt sind. Es fehlen jedoch spezifische Details darüber, wie diese Maßnahmen konkret auf die Auswirkungen der Nichtkonformitäten abgestimmt werden. Der PDCA-Zyklus wird erwähnt, was auf eine systematische Verbesserung hinweist, jedoch gibt es keine expliziten Hinweise darauf, dass die Korrekturmaßnahmen immer adäquat den Auswirkungen angepasst werden. Daher wird ein Status 'needs improvement' vergeben.
- **Primaere Fundstelle:** `heading_path: 3.3.11. A-011 ... CAPA & VERBESSERUNG | page_no: 78`

### F09
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/10-2-nichtkonformit-t-und-korrekturma-nahmen::ru::3538913bb3f6`
- **Klausel:** `10.2 Nichtkonformität und Korrekturmaßnahmen`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Informationen aufbewahren als Nachweis der Art der Nichtkonformität sowie jeder daraufhin getroffenen Maßnahme.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Beweise belegen, dass die Organisation dokumentierte Informationen aufbewahrt, die zur Nachverfolgung von Nichtkonformitäten und Maßnahmen dienen. Es gibt jedoch keinen spezifischen Nachweis, dass diese Informationen umfassend alle Arten der Nichtkonformität und alle getroffenen Maßnahmen abdecken. Zudem könnte eine detailliertere Dokumentation oder spezifische Prozesse zur Handhabung dieser Informationen erforderlich sein.
- **Primaere Fundstelle:** `heading_path: Datenschutz und Compliance (DSGVO) | page_no: 57`

### F10
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/2-normative-verweisungen::ru::0c5554986fd5`
- **Klausel:** `2 Normative Verweisungen`
- **Anforderung (ru_statement):** `Die folgenden Dokumente, die in diesem Dokument teilweise oder als Ganzes zitiert werden, sind für die Anwendung dieses Dokuments erforderlich.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Zitation und Nutzung der Dokumente wird in den bereitgestellten Evidenzen angesprochen, aber es fehlt eine klare und konsistente Vorgehensweise zur Anwendung und Notwendigkeit dieser Dokumente im gesamten System. Insbesondere wird keine eindeutige Anforderung oder Übereinstimmung in Bezug auf die Notwendigkeit spezifischer Dokumente erwähnt, die für die Anwendung wichtig sind.
- **Primaere Fundstelle:** `heading_path: 3.3.6.2.2. WORKFLOW: ERSTELLUNG, FREIGABE UND VERÖFFENTLICHUNG | page_no: 61`

### F11
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/2-normative-verweisungen::ru::c0e8e1082e6d`
- **Klausel:** `2 Normative Verweisungen`
- **Anforderung (ru_statement):** `Bei undatierten Verweisungen gilt die letzte Ausgabe des in Bezug genommenen Dokuments (einschließlich aller Änderungen).`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die dokumentierten Verfahren zur Änderungskontrolle und Dokumentenlenkung zeigen, dass Änderungen am Managementsystem geplant und kontrolliert durchgeführt werden. Es wird jedoch nicht explizit erwähnt, dass bei undatierten Verweisungen die letzte Ausgabe des in Bezug genommenen Dokuments gilt, was eine Verbesserung in der Dokumentationspraxis erfordert.
- **Primaere Fundstelle:** `heading_path: 2.8.3. PLANUNG VON ÄNDERUNGEN | page_no: 37`

### F12
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/4-3-festlegen-des-anwendungsbereichs-des-qualit-tsmanagementsystems::ru::250b7ff96927`
- **Klausel:** `4.3 Festlegen des Anwendungsbereichs des Qualitätsmanagementsystems`
- **Anforderung (ru_statement):** `Der Anwendungsbereich des Qualitätsmanagementsystems der Organisation muss als dokumentierte Information verfügbar sein und aufrechterhalten werden.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Evidenz beschreibt die Dokumentation des Managementsystems und die Kontrolle der Dokumente, jedoch fehlt spezifische Information über den Anwendungsbereich des Qualitätsmanagementsystems und ob dieser als dokumentierte Information verfügbar ist und aufrechterhalten wird.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F13
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/4-3-festlegen-des-anwendungsbereichs-des-qualit-tsmanagementsystems::ru::4abd01c3763e`
- **Klausel:** `4.3 Festlegen des Anwendungsbereichs des Qualitätsmanagementsystems`
- **Anforderung (ru_statement):** `Der Anwendungsbereich muss eine Begründung für jede Anforderung dieser Internationalen Norm liefern, die von der Organisation als nicht zutreffend hinsichtlich des Anwendungsbereiches ihres Qualitätsmanagementsystems bes`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Der Anwendungsbereich des Qualitätsmanagementsystems muss eine spezifische Begründung für die Anforderungen liefern, die nicht zutreffen. Während die Evidenz zeigt, dass das Managementsystem mehrere Aspekte der Normen integriert, fehlt eine explizite Erklärung zur rechtfertigenden Begründung der nicht zutreffenden Anforderungen im Anwendungsbereich. Das Managementsystem sollte außerdem sicherstellen, dass diese Begründungen dokumentiert werden und erreichbar sind.
- **Primaere Fundstelle:** `heading_path: 2.2. FÜHRUNG | page_no: 14`

### F14
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/6-2-qualit-tsziele-und-planung-zu-deren-erreichung::ru::6ace20cf8fec`
- **Klausel:** `6.2 Qualitätsziele und Planung zu deren Erreichung`
- **Anforderung (ru_statement):** `Bei der Planung zum Erreichen der Qualitätsziele muss die Organisation bestimmen was getan wird.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation hat Maßnahmen zur Risiko- und Chancenbewertung sowie zur Kompetenzerhebung beschrieben. Es gibt Prozesse zur Planung von Änderungen und zur Definition der Schnittstellen, was darauf hindeutet, dass sie ermöglichen, zu bestimmen, was getan werden muss, um die Ziele zu erreichen. Allerdings fehlen spezifische Informationen darüber, wie die Identifikation und Planung von Maßnahmen zur Erreichung der Qualitätsziele konkret durchgeführt wird.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F15
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/6-2-qualit-tsziele-und-planung-zu-deren-erreichung::ru::830b4f9d95ac`
- **Klausel:** `6.2 Qualitätsziele und Planung zu deren Erreichung`
- **Anforderung (ru_statement):** `Die Qualitätsziele müssen zutreffende Anforderungen berücksichtigen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Evidenz bezieht sich auf Qualitätsziele, die Kundenzufriedenheit, Fehlerreduktion und termingerechte Lieferung betrachten. Die relevanten Anforderungen an diese Ziele sind jedoch nicht vollständig dokumentiert, und es fehlen spezifische Informationen darüber, wie diese Ziele die zutreffenden Anforderungen berücksichtigen. Es gibt allgemeine Aussagen über die Unternehmenspolitik und die Verpflichtung zur Übererfüllung der Kundenanforderungen, jedoch keine spezifischen Anklänge an die Analyse oder Berücksichtigung der relevanten Anforderungen im Rahmen der Qualitätsziele.
- **Primaere Fundstelle:** `heading_path: 2.5.6. TÄTIGKEITEN NACH LIEFERUNG UND FREIGABE | page_no: 32`

### F16
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-1-5-2-messtechnische-r-ckf-hrbarkeit-n1::ru::318a16ee3fca`
- **Klausel:** `7.1.5.2 Messtechnische Rückführbarkeit N1)`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, ob die Gültigkeit früherer Messergebnisse beeinträchtigt wurde, wenn das Messmittel für seinen vorgesehenen Einsatz ungeeignet ist.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die zur Verfügung gestellten Evidenzstücke beziehen sich auf Kompetenzen, Wirksamkeitsprüfungen und Prozessvalidierungen, bieten jedoch keinen spezifischen Nachweis über die Ermittlung der Gültigkeit früherer Messergebnisse bei ungeeigneten Messmitteln. Es wird zwar die Bedeutung von Wirksamkeit und Überwachung angesprochen, jedoch fehlen konkrete Details oder Verfahren zur Adressierung der Anforderungen der Compliance-Norm.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F17
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-1-5-2-messtechnische-r-ckf-hrbarkeit-n1::ru::667186cd7389`
- **Klausel:** `7.1.5.2 Messtechnische Rückführbarkeit N1)`
- **Anforderung (ru_statement):** `Die Organisation muss geeignete Maßnahmen einleiten, wenn die Gültigkeit früherer Messergebnisse beeinträchtigt wurde.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation hat Prozesse zur Überprüfung und Bewertung von Maßnahmen in ihrer Qualitätsmanagementsystemdokumentation beschrieben. Es gibt jedoch keine spezifischen Hinweise, dass geeignete Maßnahmen eingeleitet werden, wenn die Gültigkeit früherer Messergebnisse beeinträchtigt wurde, was direkt auf die Anforderung abzielt.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F18
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-3-bewusstsein::ru::19649d16a217`
- **Klausel:** `7.3 Bewusstsein`
- **Anforderung (ru_statement):** `Die Organisation muss sicherstellen, dass die Personen sich der Qualitätspolitik bewusst sind.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation beschreibt, dass die oberste Leitung sich zu den Grundsätzen des Managementsystems bekennt und dass spezifische Rollen und Verantwortlichkeiten festgelegt sind. Es wird jedoch nicht explizit erwähnt, wie die Mitarbeiter über die Qualitätspolitik informiert werden oder wie deren Bewusstsein aktiv gefördert wird.
- **Primaere Fundstelle:** `heading_path: 2.2. FÜHRUNG | page_no: 14`

### F19
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-3-bewusstsein::ru::238a6c30e51a`
- **Klausel:** `7.3 Bewusstsein`
- **Anforderung (ru_statement):** `Die Organisation muss sicherstellen, dass die Personen sich der relevanten Qualitätsziele bewusst sind.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Evidenz zeigt, dass die Organisation Qualitätsziele formuliert hat und dass Führungsverantwortung für die Vermittlung relevanter Ziele vorhanden ist. Es werden auch Kompetenzen beschrieben, die für die Qualitätssicherung wichtig sind. Allerdings fehlen spezifische Nachweise darüber, wie die Mitarbeiter aktiv über die relevanten Qualitätsziele informiert und geschult werden, um ein vollständiges Bewusstsein zu schaffen.
- **Primaere Fundstelle:** `heading_path: 2.2. FÜHRUNG | page_no: 14`

### F20
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-3-bewusstsein::ru::fcfa882e48cc`
- **Klausel:** `7.3 Bewusstsein`
- **Anforderung (ru_statement):** `Die Organisation muss sicherstellen, dass die Personen sich der Folgen einer Nichterfüllung der Anforderungen des Qualitätsmanagementsystems bewusst sind.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Evidenzstücke zeigen, dass die Organisation Rollen und Verantwortlichkeiten definiert hat, jedoch fehlen spezifische Hinweise darauf, wie das Bewusstsein der Mitarbeiter über die Folgen der Nichterfüllung der Anforderungen des Qualitätsmanagementsystems sichergestellt wird. Es wird nicht ausdrücklich erwähnt, wie diese Informationen an die Mitarbeiter vermittelt werden und inwieweit die Schulungen oder Informationsmaßnahmen umgesetzt werden, um dieses Bewusstsein zu fördern.
- **Primaere Fundstelle:** `heading_path: 2.2. FÜHRUNG | page_no: 14`

### F21
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-4-kommunikation::ru::02bb418ad39c`
- **Klausel:** `7.4 Kommunikation`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, mit wem kommuniziert wird.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Beweisdokumente erwähnen die Verpflichtung der Geschäftsführung zur kontinuierlichen Verbesserung und zur Prüfung der IT-Sicherheitsstrategie im Kontext der Erwartungen der interessierten Parteien. Es wird jedoch nicht konkret darauf eingegangen, mit wem genau kommuniziert wird. Daher ist die Anforderung teilweiser erforderlich, jedoch nicht vollständig erfüllt.
- **Primaere Fundstelle:** `heading_path: Die Rolle der Geschäftsführung in der IT-Governance | page_no: 83`

### F22
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/7-4-kommunikation::ru::4ead9e82bd33`
- **Klausel:** `7.4 Kommunikation`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, worüber sie kommunizieren wird.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Evidenz deutet darauf hin, dass die Organisation Kommunikationsstrategien im Kontext der IT-Governance und Wissensmanagement hat, jedoch keine spezifischen Aussagen darüber gemacht wurden, worüber die Organisation konkret kommunizieren wird, was es schwierig macht, die volle Konformität mit der Anforderung zu bestätigen.
- **Primaere Fundstelle:** `heading_path: Die Rolle der Geschäftsführung in der IT-Governance | page_no: 83`

### F23
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-1-betriebliche-planung-und-steuerung::ru::00eb9ecc70e7`
- **Klausel:** `8.1 Betriebliche Planung und Steuerung`
- **Anforderung (ru_statement):** `Die Organisation muss die Anforderungen an die Produkte und Dienstleistungen bestimmen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Evidenz zeigt, dass die Organisation Anforderungen an Produkte und Dienstleistungen bestimmt und externe Anbieter entsprechend ausgewählt werden, jedoch sind die spezifischen Schritte zur Bestimmung dieser Anforderungen nicht detailliert beschrieben. Der Beschaffungsprozess und die Überprüfung von externen Dienstleistungen sind vorhanden, es fehlen jedoch klare Hinweise darauf, wie die Anforderungen direkt für alle Produkte und Dienstleistungen erfasst werden. Daher ist eine Verbesserung der Prozesse notwendig.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F24
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-2-3-berpr-fung-der-anforderungen-f-r-produkte-und-dienstleistungen::ru::8f8a3a52fc08`
- **Klausel:** `8.2.3 Überprüfung der Anforderungen für Produkte und Dienstleistungen`
- **Anforderung (ru_statement):** `Die Überprüfung muss die vom Kunden nicht angegebenen Anforderungen, die jedoch für den festgelegten oder den beabsichtigten Gebrauch, soweit bekannt, notwendig sind, einschließen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Kontextdokumente zeigen, dass die Anforderungen an die Überprüfung und das Verständnis der Erwartungen von interessierten Parteien systematisch behandelt werden. Allerdings wird nicht spezifisch erwähnt, wie die vom Kunden nicht angegebenen Anforderungen in die Überprüfung integriert werden, um den festgelegten oder beabsichtigten Gebrauch zu gewährleisten.
- **Primaere Fundstelle:** `heading_path: 3.3.6.2. UNSERE AUFBAU UNSERER DOKUMENTATION | page_no: 60`

### F25
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-2-3-berpr-fung-der-anforderungen-f-r-produkte-und-dienstleistungen::ru::9ec947281297`
- **Klausel:** `8.2.3 Überprüfung der Anforderungen für Produkte und Dienstleistungen`
- **Anforderung (ru_statement):** `Die Organisation muss sicherstellen, dass Anforderungen im Vertrag oder Auftrag, die sich von den zuvor festgelegten unterscheiden, geklärt werden.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Evidenzstücke beschreiben Prozesse zur Planung von Änderungen und die Berücksichtigung von Kundenanforderungen, jedoch fehlt eine spezifische Bestätigung, dass abweichende Anforderungen im Vertrag oder Auftrag systematisch geklärt werden. Empfehlungen zur methodischen Ermittlung von Anforderungen und zur Überprüfung von rechtlichen Verpflichtungen könnten auf die Notwendigkeit hinweisen, Anpassungen bei Änderungen im Vertrag vorzunehmen, aber konkrete Verfahren zur Klärung von unterschiedlichen Anforderungen sind nicht dokumentiert.
- **Primaere Fundstelle:** `heading_path: 2.8.3. PLANUNG VON ÄNDERUNGEN | page_no: 37`

### F26
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-2-entwicklungsplanung::ru::fda36051e40a`
- **Klausel:** `8.3.2 Entwicklungsplanung`
- **Anforderung (ru_statement):** `Die Organisation muss bei der Entwicklungsplanung die benötigten dokumentierten Informationen, um zu bestätigen, dass die Anforderungen an die Entwicklung erfüllt wurden, berücksichtigen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation hat Prozesse zur Dokumentation und Überprüfung der Anforderungen implementiert, jedoch ist nicht konkret beschrieben, wie alle benötigten dokumentierten Informationen zur Bestätigung der Entwicklungsanforderungen systematisch erfasst werden. Es wird zwar auf den Wissenserhalt und die Dokumentation von Erkenntnissen hingewiesen, doch die spezifischen erforderlichen Informationen für die Entwicklungsplanung sind nicht vollständig erörtert.
- **Primaere Fundstelle:** `heading_path: 2.2.8.2. BINDENDE VERPFLICHTUNGEN (RECHTSMANAGEMENT) | page_no: 23`

### F27
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-4-steuerungsma-nahmen-f-r-die-entwicklung::ru::063fd1273cd2`
- **Klausel:** `8.3.4 Steuerungsmaßnahmen für die Entwicklung`
- **Anforderung (ru_statement):** `Verifizierungstätigkeiten müssen durchgeführt werden, um sicherzustellen, dass die Entwicklungsergebnisse die in den Entwicklungseingaben enthaltenen Anforderungen erfüllen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Evidenzstücke verdeutlichen die Notwendigkeit von Kontrolltätigkeiten und die Qualifikation des Personals für Verifizierungstätigkeiten. Dennoch fehlt eine direkte Bestätigung, dass Verifizierungstätigkeiten systematisch durchgeführt werden, um sicherzustellen, dass Entwicklungsergebnisse die Anforderungen erfüllen.
- **Primaere Fundstelle:** `heading_path: 2.5.2. STEUERUNG EXTERN BEREITGESTELLTER PROZESSE, PRODUKTE UND DIENSTLEISTUNGEN | page_no: 31`

### F28
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-5-entwicklungsergebnisse::ru::7cc33c828dcd`
- **Klausel:** `8.3.5 Entwicklungsergebnisse`
- **Anforderung (ru_statement):** `Die Organisation muss sicherstellen, dass die Entwicklungsergebnisse Anforderungen an die Überwachung und Messung, soweit zutreffend, sowie Annahmekriterien enthalten oder auf sie verweisen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die vorliegenden Texte zeigen, dass die Organisation Maßnahmen zur Überwachung und Kontrolle von Qualitätsstandards sowie zur Planung von Veränderungen trifft. Es wird jedoch nicht explizit erwähnt, dass die Entwicklungsergebnisse Annahmekriterien für die Überwachung und Messung beinhalten oder darauf verweisen. Somit gibt es Verbesserungspotenzial in der Dokumentation.
- **Primaere Fundstelle:** `heading_path: 2.2.8.2. BINDENDE VERPFLICHTUNGEN (RECHTSMANAGEMENT) | page_no: 23`

### F29
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-6-entwicklungs-nderungen::ru::b114c8f023e8`
- **Klausel:** `8.3.6 Entwicklungsänderungen`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Informationen zu den eingeleiteten Maßnahmen zur Vorbeugung nachteiliger Auswirkungen aufbewahren.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation führt Maßnahmen zur Risiko- und Chancenbewertung durch und plant gezielte Maßnahmen zur Minimierung unerwünschter Auswirkungen, jedoch gibt es keine spezifischen Informationen darüber, welche dokumentierten Informationen zu den eingeleiteten Maßnahmen zur Vorbeugung nachteiliger Auswirkungen aufbewahrt werden müssen.
- **Primaere Fundstelle:** `heading_path: 2.3.1. MAßNAHMEN ZUM UMGANG MIT RISIKEN UND CHANCEN | page_no: 26`

### F30
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-6-entwicklungs-nderungen::ru::dc957d303c76`
- **Klausel:** `8.3.6 Entwicklungsänderungen`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Informationen zur Autorisierung der Änderungen aufbewahren.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Es gibt Hinweise darauf, dass die Organisation dokumentierte Informationen zur Autorisierung von Änderungen aufbewahrt, jedoch sind die spezifischen Prozesse und Nachweise zur Autorisierung im Kontext der präsentierten Dokumentation nicht klar erkennbar. Während die Dokumentation und ihre Überprüfung angesprochen werden, fehlt eine direkte Bezugnahme auf die Autorisierung von Änderungen selbst.
- **Primaere Fundstelle:** `heading_path: Die Rolle der Geschäftsführung in der IT-Governance | page_no: 83`

### F31
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-4-3-informationen-f-r-externe-anbieter::ru::bd7e6b14fb64`
- **Klausel:** `8.4.3 Informationen für externe Anbieter`
- **Anforderung (ru_statement):** `Die Organisation muss die Angemessenheit der Anforderungen vor deren Bekanntgabe gegenüber externen Anbietern sicherstellen.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die Organisation hat Mechanismen zur Sicherstellung der Anforderungsgerechtigkeit gegenüber externen Anbietern implementiert, wie z.B. Machbarkeitsprüfungen und kontinuierliche Überwachung der Anforderungen. Es liegen jedoch Hinweise vor, die darauf hindeuten, dass die Informationen möglicherweise nicht regelmäßig genug aktualisiert werden oder dass nicht in jedem Fall sichergestellt wird, dass alle Anforderungen vor Bekanntgabe getestet werden, was eine Verbesserung benötigt.
- **Primaere Fundstelle:** `heading_path: 2.2.5.6. KOMMUNIKATIONS- UND INFORMATIONSSTRATEGIEN | page_no: 18`

### F32
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-5-1-steuerung-der-produktion-und-der-dienstleistungserbringung::ru::313a938a9611`
- **Klausel:** `8.5.1 Steuerung der Produktion und der Dienstleistungserbringung`
- **Anforderung (ru_statement):** `Falls zutreffend, müssen beherrschte Bedingungen die Durchführung von Maßnahmen zur Verhinderung menschlicher Fehler enthalten.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Informationen zeigen, dass das Unternehmen Maßnahmen zur Verhinderung von Fehlern implementiert und eine Fehlerkultur fördert. Jedoch fehlt eine klare Erwähnung kontrollierter Bedingungen, die spezifisch auf die Durchführung von Maßnahmen zur Verhinderung menschlicher Fehler ausgerichtet sind. Daher besteht Verbesserungspotential in der dokumentierten Steuerung dieser Prozesse.
- **Primaere Fundstelle:** `heading_path: Der Weg zur 'Zero-Malware-Resilience' | page_no: 58`

### F33
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-5-6-berwachung-von-nderungen::ru::1dab697eff9b`
- **Klausel:** `8.5.6 Überwachung von Änderungen`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Informationen aufbewahren, in denen die Ergebnisse der Überprüfung von Änderungen, die Personen, die die Änderung autorisiert haben, sowie jegliche notwendige Tätigkeiten, die sich aus`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Informationen belegen, dass Änderungen im Managementsystem dokumentiert und überprüft werden. Allerdings fehlt eine spezifische Erwähnung, dass die Ergebnisse der Überprüfung der Änderungen, die autorisierenden Personen und die notwendigen Tätigkeiten dokumentiert werden, was die Konformität mit der Anforderung beeinträchtigt.
- **Primaere Fundstelle:** `heading_path: 3.3.6.2. UNSERE AUFBAU UNSERER DOKUMENTATION | page_no: 60`

### F34
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-6-freigabe-von-produkten-und-dienstleistungen::ru::71edb5ba1c95`
- **Klausel:** `8.6 Freigabe von Produkten und Dienstleistungen`
- **Anforderung (ru_statement):** `Die dokumentierten Informationen müssen die Rückverfolgbarkeit zu Personen enthalten, welche die Freigabe autorisiert haben.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Evidenzen zeigen eine teilweise Rückverfolgbarkeit von Dokumenten und Freigaben, jedoch fehlt eine klare Zuordnung von Personen, die die Freigabe autorisiert haben, sowie spezifische Informationen zu den dokumentierten Freigaben selbst.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 30`

### F35
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-7-2-die-organisation-muss-dokumentierte-informationen-aufbewahren-die::ru::2b4b48d88694`
- **Klausel:** `8.7.2 Die Organisation muss dokumentierte Informationen aufbewahren, die`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Informationen aufbewahren, die die Nichtkonformität beschreiben.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Es gibt Hinweise darauf, dass dokumentierte Informationen bezüglich der Nichtkonformität aufbewahrt werden, allerdings könnte die Spezifität der Informationen zur Nichtkonformität verbessert werden. Die Erwähnung von Dokumenten, die Ergebnisse und den Umgang mit Nichtkonformitäten regeln, deutet darauf hin, dass diese Informationen vorhanden sind, ist jedoch nicht explizit belegt.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 30`

### F36
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/a-6-dokumentierte-informationen::ru::df08837a2505`
- **Klausel:** `A.6 Dokumentierte Informationen`
- **Anforderung (ru_statement):** `An den Stellen dieser Internationalen Norm, an denen auf 'Information' anstatt auf 'dokumentierte Information' verwiesen wird, besteht keine Anforderung, dass diese Information zu dokumentieren ist.`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Evidenz-Chunks zeigen, dass die Organisation dokumentierte Informationen unterhält und Wissen in Bezug auf Kundenanforderungen und Risiken verwaltet. Es wird jedoch nicht explizit darauf eingegangen, wie Informationen, auf die in der Standardnorm verwiesen wird, dokumentiert oder behandelt werden, was darauf hinweist, dass es Verbesserungsbedarf gibt, um den Anforderungen der Norm gerecht zu werden.
- **Primaere Fundstelle:** `heading_path: 2.1.2. VERSTEHEN DER ERFORDERNISSE UND ERWARTUNGEN INTERESSIERTER PARTEIEN | page_no: 11`

### F37
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/andere-internationale-normen-des-iso-tc-176-zu-qualit-tsmanagement-und-qualit-tsmanagementsystemen::ru::e0744b693f1f`
- **Klausel:** `Andere Internationale Normen des ISO/TC 176 zu Qualitätsmanagement und Qualitätsmanagementsystemen`
- **Anforderung (ru_statement):** `ISO 10012 enthält Leitlinien für die Steuerung von Messprozessen und die metrologische Bestätigung von Messmitteln, die für die Unterstützung und den Nachweis der Übereinstimmung mit metrologischen Anforderungen eingeset`
- **Status:** `needs_improvement` | **Confidence:** `0.70`
- **Warum (LLM):** Die bereitgestellten Dokumente beschreiben Elemente des Qualitätsmanagements gemäß ISO 9001, jedoch fehlen spezifische Informationen über die Umsetzung der Leitlinien aus ISO 10012 zur Steuerung von Messprozessen und zur metrologischen Bestätigung der Messmittel. Eine tiefere Analyse oder spezifische Hinweise zu den Messprozessen und den verwendeten Messmitteln sind nicht vorhanden, was auf Verbesserungsbedarf hinweist.
- **Primaere Fundstelle:** `heading_path: 2.1.3.1. DIE WECHELWIRKUNG VON PROZESSEN | page_no: 12`

### F38
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-2-1-kommunikation-mit-den-kunden::ru::2bf915161aa9`
- **Klausel:** `8.2.1 Kommunikation mit den Kunden`
- **Anforderung (ru_statement):** `Die Kommunikation mit Kunden muss den Umgang mit Anfragen, Verträgen oder Aufträgen, einschließlich Änderungen, umfassen.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die vorliegenden Informationen zeigen, dass das Unternehmen über Kommunikationsstrategien und Prozesse zur Handhabung von Anforderungen und Änderungen verfügt. Allerdings könnte eine klarere Dokumentation und Beschreibung spezifischer Kommunikationspraktiken bezüglich Kundenanfragen und Vertragsmanagement hilfreich sein, um den vollständigen Anforderungen der Norm gerecht zu werden.
- **Primaere Fundstelle:** `heading_path: 3.3.7.3. UMGANG MIT EIGENTUM VON KUNDEN UND PARTNERN | page_no: 66`

### F39
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-2-entwicklungsplanung::ru::4088b6c11b81`
- **Klausel:** `8.3.2 Entwicklungsplanung`
- **Anforderung (ru_statement):** `Die Organisation muss bei der Entwicklungsplanung die erforderlichen Prozessphasen, einschließlich zutreffender Überprüfungen der Entwicklung, berücksichtigen.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die Organisation berücksichtigt Prozessphasen, jedoch sind die spezifischen Überprüfungsmaßnahmen in der Entwicklungsplanung nicht ausreichend beschrieben. Es gibt allgemeine Hinweise zur Systematik von Prozessen und Verantwortlichkeiten, was auf einen Bedarf an weiteren Details in der Umsetzung hinweist.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F40
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-2-entwicklungsplanung::ru::52eacdb0c92d`
- **Klausel:** `8.3.2 Entwicklungsplanung`
- **Anforderung (ru_statement):** `Die Organisation muss bei der Entwicklungsplanung den internen und externen Ressourcenbedarf für die Entwicklung von Produkten und Dienstleistungen berücksichtigen.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die vorliegenden Evidenzen zeigen, dass die Organisation Verantwortung für externe Partner und deren Auswahlkriterien übernimmt, was auf eine Berücksichtigung externer Ressourcen hinweist. Jedoch gibt es keine explizite Angabe, dass der interne Ressourcenbedarf in gleicher Weise konkret berücksichtigt wird. Daher besteht Raum für Verbesserung in der Dokumentation und dem Nachweis dieser Aspekte in der Entwicklungsplanung.
- **Primaere Fundstelle:** `heading_path: 2.5.2. STEUERUNG EXTERN BEREITGESTELLTER PROZESSE, PRODUKTE UND DIENSTLEISTUNGEN | page_no: 31`

### F41
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/8-3-2-entwicklungsplanung::ru::7ea594f4c97b`
- **Klausel:** `8.3.2 Entwicklungsplanung`
- **Anforderung (ru_statement):** `Die Organisation muss bei der Entwicklungsplanung die Art, die Dauer und den Umfang der Entwicklungstätigkeiten berücksichtigen.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die Evidenz belegt, dass die Organisation bei der Planungs- und Steuerungsphase sowohl Qualifikationen als auch Risiken berücksichtigt. Allerdings gibt es keine spezifischen Referenzen zu den Aspekten Art, Dauer und Umfang der Entwicklungstätigkeiten im Kontext der Entwicklungsplanung, was bedeutet, dass hier Verbesserungsbedarf besteht.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 29`

### F42
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/9-1-1-allgemeines::ru::9389f778b027`
- **Klausel:** `9.1.1 Allgemeines`
- **Anforderung (ru_statement):** `Die Organisation muss bestimmen, wann die Überwachung und Messung durchzuführen sind.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die bereitgestellten Evidenzen erwähnen allgemeine Prüfzyklen und die Überwachung sowie die Analyse von Kennzahlen, jedoch sind keine spezifischen Angaben dazu vorhanden, wann genau die Überwachung und Messung durchgeführt werden müssen. Dies deutet auf einen Verbesserungspotenzial hin, da diese spezifischen Zeitpunkte nicht klar definiert sind.
- **Primaere Fundstelle:** `heading_path: 3.3.6.2. UNSERE AUFBAU UNSERER DOKUMENTATION | page_no: 60`

### F43
- **ru_key:** `ÖNORM_EN_ISO_9001_2015_11/9-2-internes-audit::ru::a1b49b00c0d1`
- **Klausel:** `9.2 Internes Audit`
- **Anforderung (ru_statement):** `Die Organisation muss dokumentierte Information als Nachweis der Verwirklichung des Auditprogramms und der Ergebnisse der Audits aufbewahren.`
- **Status:** `needs_improvement` | **Confidence:** `0.60`
- **Warum (LLM):** Die vorliegenden Evidenzstücke weisen darauf hin, dass dokumentierte Informationen bezüglich interner Audits und jeweiliger Verfahren vorhanden sind. Es wird jedoch nicht explizit erwähnt, dass die Ergebnisse der Audits als umfassender Nachweis aufbewahrt werden. Es gibt Hinweise auf die Durchführung interner Audits und die zugehörige Dokumentation, jedoch fehlt der klare Bezug zur Aufbewahrung der Auditprogramme und Ergebnisse, um die Vorgabe vollständig zu erfüllen.
- **Primaere Fundstelle:** `heading_path: 2.4.4.1. KOMPETENZEN | page_no: 30`
