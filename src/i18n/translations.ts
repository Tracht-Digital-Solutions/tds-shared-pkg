export const translations = {
  de: {
    nav: {
      about: "Über mich",
      services: "Leistungen",
      tech: "Tech",
      portfolio: "Portfolio",
      process: "Prozess",
      blog: "Journal",
      contact: "Kontakt",
      cta: "Unverbindlich anfragen",
      pricing: "Preise",
    },
    hero: {
      availability: "Verfügbar für Projekte · Q3 2026",
      location: "Schwarzenbek · Hamburg",
      headline: "Digitalisierung, die",
      headlineAccent: "Arbeit",
      headlineSuffix: "abnimmt.",
      sub: "Websites, Webshops und Werkzeuge für kleine Betriebe. Ich schaue, wo es hakt – und baue, was hilft. Aus Schwarzenbek bei Hamburg.",
      cta1: "Unverbindlich anfragen",
      cta2: "Leistungen ansehen",
      scrollHint: "Scrollen",
    },
    about: {
      label: "— 01 / Über mich",
      headline: "Hi, ich bin",
      headlineAccent: "Julian.",
      lead: "Ich bin freier Entwickler in Schwarzenbek bei Hamburg. Ich arbeite für Selbstständige und kleine Betriebe ohne eigene IT.",
      p1: "Website, Webshop, kleines Programm oder ein Ablauf, der einfacher werden soll: Ich höre zu, sortiere das Vorhaben und setze es um. Ein Ansprechpartner, von Anfang bis Ende.",
      p2: "Standardsoftware zwingt Sie, sich anzupassen. Ein gutes Werkzeug macht es andersherum. Manchmal ist die ehrliche Antwort: Es lohnt sich nicht.",
      portraitPlaceholder:
        "Hier könnte ein Schwarz-Weiß-Portrait von Julian stehen — schräg sitzend am Schreibtisch, leicht zur Kamera gewandt, naturnahes Licht.",
      stat1Value: "5+",
      stat1Label: "Jahre Erfahrung",
      stat2Value: "5",
      stat2Label: "Leistungsbereiche",
      stat3Value: "1:1",
      stat3Label: "Persönliche Betreuung",
    },
    services: {
      label: "— 02 / Leistungen",
      headline: "Was ich für Sie",
      headlineAccent: "leiste.",
      /* Fünf Karten, eine je Angebot aus den Kleinanzeigen — und in DIESER
         Reihenfolge: Digitalisierung führt (das primäre Suchziel, siehe
         seo.ts), Konzept steht vor Umsetzung, Webshop zuletzt. ServiceCard
         lässt bei ungerader Anzahl die LETZTE Karte über beide Spalten
         laufen, der Webshop ist also bewusst die breite.
         Die Tag-Zeile trägt das Ergebnis, nicht das Werkzeug: die Zielgruppe
         sind Betriebe ohne eigene IT, die nicht nach Framework-Namen suchen.
         Der Tech-Stack steht vollständig im eigenen TechMarquee-Abschnitt. */
      items: [
        {
          number: "01",
          title: "Digitalisierung für Unternehmen",
          description: "Listen von Hand, Zahlen aus drei Quellen, immer wieder abtippen. Ich nehme mir einen konkreten Ablauf vor und mache ihn einfacher – nicht gleich den ganzen Betrieb.",
          tags: ["Abläufe", "Auswertungen", "Automatisierung", "Schnittstellen"],
        },
        {
          number: "02",
          title: "Digitale Konzepte",
          description: "Sie haben eine Idee, aber noch keinen Plan. Ich mache daraus ein verständliches Konzept: was gebraucht wird, welcher Weg sinnvoll ist, was er kostet.",
          tags: ["Anforderungen", "Klickbarer Entwurf", "Aufwand", "Fahrplan"],
        },
        {
          number: "03",
          title: "Auftragsentwicklung",
          description: "Nicht jede Aufgabe braucht ein großes Programm. Oft reicht das Werkzeug, das zu Ihrer Arbeit passt: eine Excel-Vorlage, eine kleine Anwendung, eine Auswertung.",
          tags: ["Excel-Vorlage", "Kleine Anwendung", "Auswertung", "Datenübernahme"],
        },
        {
          number: "04",
          title: "Webauftritt",
          description: "Veraltet, unklar oder noch gar nicht da? Dann springen Interessenten ab, bevor sie anfragen. Ich baue neu, bringe Bestehendes auf Stand – und pflege es weiter.",
          tags: ["Neue Website", "Überarbeitung", "Pflege", "Auffindbarkeit"],
        },
        {
          number: "05",
          title: "Webshop",
          description: "Ihr Laden läuft, jetzt soll es online weitergehen. Ich plane, baue und betreue den Shop – auf Wunsch so, dass Artikel und Bestand vom Handy aus laufen.",
          tags: ["Onlineverkauf", "Produktpflege", "Bestand per Handy", "Betreuung"],
        },
      ],
    },
    tech: {
      label: "Tech Stack",
      headline: "Womit ich",
      headlineAccent: "arbeite.",
      body: "Werkzeuge, die sich bewährt haben – keine Glaubensfrage, sondern das Richtige fürs Problem. Sprachen wechseln, gute Architektur bleibt.",
    },
    portfolio: {
      label: "— 03 / Portfolio",
      headline: "Ausgewählte",
      headlineAccent: "Projekte.",
      comingSoon: "Demnächst",
      placeholderLabel: "Platzhalter",
      items: [
        {
          number: "01",
          badge: "Web-App",
          title: "Mittelstands-Plattform",
          description: "Eine maßgeschneiderte Webanwendung für einen mittelständischen Kunden – individuell entwickelt, skalierbar gebaut.",
          stack: ["Angular", "Node.js", "SQL"],
          imagePlaceholder:
            "Screenshot des Dashboards mit zentraler KPI-Übersicht, links Sidebar-Navigation, rechts ein Detailpanel.",
        },
        {
          number: "02",
          badge: "Digitalisierung",
          title: "Prozess-Automatisierung",
          description: "Automatisierung manueller Geschäftsprozesse durch intelligente Workflows und Datenpipelines.",
          stack: ["Python", "KNIME", "SQL"],
          imagePlaceholder:
            "Workflow-Diagramm: KNIME-Knoten, die Daten aus drei Quellen zusammenführen, validieren und in eine SQL-Tabelle schreiben.",
        },
        {
          number: "03",
          badge: "Web-Auftritt",
          title: "Markenpräsenz Mittelstand",
          description: "Professioneller Webauftritt für ein etabliertes Unternehmen – performant, barrierefrei, individuell.",
          stack: ["WordPress", "TypeScript"],
          imagePlaceholder:
            "Hero-Mockup der Kunden-Website auf Desktop und Mobile – ruhige Typografie, großes Schlüsselbild.",
        },
        {
          number: "04",
          badge: "App",
          title: "Interne Business-App",
          description: "Desktop-Applikation zur internen Prozessverwaltung – intuitiv bedienbar, wartungsfreundlich dokumentiert.",
          stack: ["C#", "SQL", "Vue"],
          imagePlaceholder:
            "Screenshot der Desktop-App: Listenansicht der Aufträge mit Filterleiste oben und Detail-Panel rechts.",
        },
      ],
    },
    process: {
      label: "— 04 / Vorgehen",
      headline: "Wie ich",
      headlineAccent: "arbeite.",
      body: "Kein starrer Ablauf. Je nach Vorhaben verschiebt sich das Gewicht. Die vier Schritte sind der übliche Rahmen, kein Korsett.",
      steps: [
        {
          number: "01",
          title: "Zuhören",
          duration: "Zum Einstieg",
          description: "Sie schildern mir, wo es hakt. Ich frage nach – und sage ehrlich, ob sich eine Umsetzung lohnt.",
        },
        {
          number: "02",
          title: "Konzept",
          duration: "Je nach Umfang",
          description: "Was wird gebraucht, welcher Weg ist sinnvoll, was kostet er? Die Grundlage steht, bevor Budget fließt.",
        },
        {
          number: "03",
          title: "Umsetzung",
          duration: "Nach Absprache",
          description: "Ich baue es und zeige Ihnen Zwischenstände. Nachsteuern ist unterwegs günstig, hinterher teuer.",
        },
        {
          number: "04",
          title: "Betreuung",
          duration: "Auf Wunsch",
          description: "Übergabe, Einweisung, auf Wunsch Pflege und Anpassungen. Ansprechpartner bleibe ich in jedem Fall.",
        },
      ],
    },
    blog: {
      label: "— 05 / Journal",
      headline: "Gedanken &",
      headlineAccent: "Artikel.",
      readMore: "Weiterlesen",
      allPosts: "Alle Artikel",
      placeholderLabel: "Platzhalter",
      /* Notfall-Teaser für den Journal-Abschnitt: greifen nur, wenn weder
         kuratierte Slugs noch echte Artikel aus /content/blog kommen. Die
         Slugs müssen deshalb denen der Seed-Migration in
         tds-ext-blog-cms-pkg entsprechen, sonst zeigt der Fallback auf 404. */
      posts: [
        {
          category: "Digitalisierung",
          title: "Digitalisierung fängt nicht beim Großprojekt an.",
          excerpt: "Sie fängt bei dem einen Ablauf an, der Sie jede Woche Stunden kostet – und den außer Ihnen niemand sieht.",
          date: "2026-08-04",
          slug: "digitalisierung-faengt-klein-an",
          imagePlaceholder:
            "Handgeschriebene Liste auf einem Klemmbrett neben einem Laptop – warmes Morgenlicht, Werkstatt im Hintergrund.",
        },
        {
          category: "Webshop",
          title: "Lohnt sich ein Webshop für mein Ladengeschäft?",
          excerpt: "Nicht für jedes Sortiment. Vier Fragen, die die Antwort meist schon vorwegnehmen.",
          date: "2026-07-21",
          slug: "lohnt-sich-ein-webshop",
          imagePlaceholder:
            "Ladentheke von oben – Produkte, ein Notizblock und ein Smartphone mit offener Produktliste.",
        },
        {
          category: "Werkzeuge",
          title: "Excel-Tabelle oder eigenes Werkzeug?",
          excerpt: "Eine Tabelle ist erstaunlich weit tragfähig. Es gibt aber drei Punkte, an denen sie zuverlässig kippt.",
          date: "2026-07-07",
          slug: "excel-oder-eigenes-werkzeug",
          imagePlaceholder:
            "Bildschirm mit einer weit gescrollten Tabelle, daneben ein Notizzettel mit Formelfragment.",
        },
      ],
    },
    contact: {
      label: "— 06 / Kontakt",
      headline: "Lassen Sie uns",
      headlineAccent: "reden.",
      sub: "Schreiben Sie mir in zwei Sätzen, wo es hakt. Ich antworte in der Regel innerhalb von 24 Stunden.",
      form: {
        name: "Name",
        namePlaceholder: "Hanna Schmidt",
        email: "E-Mail",
        emailPlaceholder: "hanna@manufaktur.de",
        company: "Unternehmen (optional)",
        companyPlaceholder: "Schmidt Manufaktur",
        message: "Nachricht",
        messagePlaceholder: "Wir pflegen unsere Preise noch in drei Listen gleichzeitig — das kostet jede Woche einen halben Tag.",
        consent: "Ich willige in die Verarbeitung meiner Daten gemäß der",
        consentLink: "Datenschutzerklärung",
        consentSuffix: "ein.",
        submit: "Nachricht senden",
        submitting: "Wird gesendet …",
        successTitle: "Nachricht erhalten!",
        successMessage: "Danke für Ihre Nachricht. Ich melde mich in der Regel innerhalb von 24 Stunden.",
        errorMessage: "Etwas ist schiefgelaufen. Bitte versuchen Sie es noch einmal.",
      },
      info: {
        emailLabel: "E-Mail",
        phoneLabel: "Handy",
        locationLabel: "Standort",
        socialLabel: "Social",
        email: "kontakt@tracht-digital.de",
        phone: "+49 178 822 4022",
        location: "Schwarzenbek · nähe Hamburg",
      },
    },
    pricing: {
      label: "— Preise",
      headline: "Transparente",
      headlineAccent: "Stundensätze.",
      sub: "Klare Preise, keine Pauschalpakete. Stundengenau abgerechnet, ehrlich geschätzt, mit einer Obergrenze, auf die Sie sich verlassen können.",
      teaserLabel: "Preise",
      teaserHeadline: "Klare Sätze,",
      teaserHeadlineAccent: "keine Pauschalen.",
      teaserSub: "Ab 95 € pro Stunde – stundengenau abgerechnet, ohne versteckte Kosten.",
      teaserCta: "Alle Stundensätze ansehen",
      teaserFromLabel: "ab",
      hourSuffix: "/ Stunde",
      includesLabel: "Beinhaltet:",
      items: [
        {
          title: "Beratung & Konzeption",
          rate: 120,
          description:
            "Strategische Begleitung, Architektur-Workshops, technische Reviews. Am Ende steht ein verständliches Konzept – nicht nur Folien.",
          includes: [
            "Aufnahme und Sortierung Ihrer Anforderungen",
            "Architektur- & Anforderungs-Workshops",
            "Code- & Stack-Reviews mit dokumentierten Empfehlungen",
            "Schriftliche Konzepte und Entscheidungsgrundlagen",
          ],
          highlight: false,
        },
        {
          title: "Web- & App-Entwicklung",
          rate: 105,
          description:
            "Frontend, Backend, mobile und Desktop-Apps. Sauber gebaut, getestet, dokumentiert – auch in zwei Jahren noch wartbar.",
          includes: [
            "Komponentenentwicklung (React, Vue, Angular)",
            "API- und Backend-Entwicklung (Node.js, C#, SQL)",
            "Mobile- und Desktop-Apps",
            "Tests, CI/CD und Dokumentation inklusive",
          ],
          highlight: true,
        },
        {
          title: "Digitalisierung & Automation",
          rate: 105,
          description:
            "Manuelle Abläufe durch Workflows, Datenpipelines und Integrationen ablösen. Konkrete Umsetzung, kein PowerPoint.",
          includes: [
            "Prozessanalyse vor Ort oder remote",
            "Workflow-Automation (Python, KNIME, n8n)",
            "Datenpipelines, ETL und SQL-Reporting",
            "Integration bestehender Tools und Systeme",
          ],
          highlight: false,
        },
        {
          title: "Wartung & Support",
          rate: 85,
          description:
            "Bestehende Systeme pflegen, Updates einspielen, Fehler beheben. Reaktionszeit nach Vereinbarung.",
          includes: [
            "Bug-Fixes und Hotfixes",
            "Dependency- und Sicherheits-Updates",
            "Monitoring und Performance-Optimierung",
            "Auf Wunsch monatliches Retainer-Modell",
          ],
          highlight: false,
        },
        {
          title: "Workshops & Schulungen",
          rate: 135,
          description:
            "Wissen weitergeben statt zurückhalten. Workshops für Ihr Team – von TypeScript-Basics bis Architektur.",
          includes: [
            "Inhouse- oder Remote-Workshops",
            "Maßgeschneiderte Schulungsunterlagen",
            "Hands-on-Übungen mit Ihrem echten Code",
            "Nachgespräch und Aufzeichnung inklusive",
          ],
          highlight: false,
        },
      ],
      notesTitle: "Gut zu wissen",
      notes: [
        "Alle Preise zzgl. gesetzlicher Mehrwertsteuer (19 %).",
        "Tagessatz auf Anfrage – Rabatt ab 5 Tagen pro Monat verfügbar.",
        "Festpreis möglich, wenn der Umfang vorab klar ist.",
        "Reisekosten werden separat abgerechnet.",
      ],
      ctaTitle: "Klingt passend?",
      ctaSub: "Schreiben Sie mir kurz, worum es geht. Ich sage Ihnen ehrlich, ob und wie ich helfen kann.",
      ctaButton: "Unverbindlich anfragen",
      back: "Zurück",
    },
    consulting: {
      label: "— Beratung",
      headline: "Erst zuhören,",
      headlineAccent: "dann bauen.",
      body: "Vielleicht haben Sie ein klares Vorhaben, vielleicht nur das Gefühl, dass etwas einfacher laufen müsste. Beides ist ein guter Anfang.",
      primaryCta: "Unverbindlich anfragen",
      secondaryCta: "Leistungen ansehen",
    },
    footer: {
      slogan: "Digitale Lösungen, die wirklich passen.",
      tagline: "Persönlich, passgenau, aus einer Hand — aus Schwarzenbek bei Hamburg.",
      nav: "Navigation",
      contactTitle: "Kontakt",
      copyright: "© 2026 Tracht Digital Solutions. Alle Rechte vorbehalten.",
      impressum: "Impressum",
      datenschutz: "Datenschutz",
      pricing: "Preise",
    },
    errors: {
      name: "Bitte geben Sie Ihren Namen an.",
      email: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
      message: "Mindestens 20 Zeichen, bitte.",
      consent: "Zustimmung erforderlich.",
    },
    cookieNotice: {
      label: "Hinweis zu Cookies und Datenschutz",
      siteText:
        "Diese Website verwendet keine Tracking-Cookies. Es werden lediglich technisch notwendige Einstellungen (z. B. Ihr Farbschema) lokal in Ihrem Browser gespeichert.",
      panelText:
        "Dieser Bereich verwendet ausschließlich ein technisch notwendiges Cookie für die sichere Anmeldung (Session-Cookie). Es findet kein Tracking statt.",
      privacy: "Mehr in der Datenschutzerklärung.",
      accept: "Verstanden",
      consentText:
        "Wir zeigen auf diesem Blog Werbung von Google AdSense. Dafür werden – nur mit Ihrer Einwilligung – Cookies und ähnliche Technologien zu Werbezwecken gesetzt. Ihre Wahl ist freiwillig und jederzeit änderbar.",
      consentAccept: "Akzeptieren",
      consentDecline: "Ablehnen",
    },
    /* Only the chrome. A toast's TEXT always comes from the caller — a
       catalogue of canned messages here would be a second source of truth for
       copy the call sites already own. */
    toast: {
      dismiss: "Schließen",
    },
  },
  en: {
    nav: {
      about: "About",
      services: "Services",
      tech: "Tech",
      portfolio: "Portfolio",
      process: "Process",
      blog: "Journal",
      contact: "Contact",
      cta: "Get in touch",
      pricing: "Pricing",
    },
    hero: {
      availability: "Available for projects · Q3 2026",
      location: "Schwarzenbek · Hamburg",
      headline: "Digitalization that takes",
      headlineAccent: "work",
      headlineSuffix: "off your hands.",
      sub: "Websites, online shops and tools for small businesses. I look at where things stick – and build what helps. From Schwarzenbek near Hamburg.",
      cta1: "Get in touch",
      cta2: "See services",
      scrollHint: "Scroll",
    },
    about: {
      label: "— 01 / About",
      headline: "Hi, I'm",
      headlineAccent: "Julian.",
      lead: "I'm a freelance developer in Schwarzenbek near Hamburg. I work with freelancers and small businesses that have no IT department.",
      p1: "Website, online shop, a small program or a workflow that should get simpler: I listen, sort out the plan and build it. One contact, start to finish.",
      p2: "Off-the-shelf software makes you adapt to it. A good tool works the other way round. Sometimes the honest answer is: it isn't worth it.",
      portraitPlaceholder:
        "A black-and-white portrait of Julian — seated at an angle at his desk, slightly turned toward the camera, soft natural light.",
      stat1Value: "5+",
      stat1Label: "Years of experience",
      stat2Value: "5",
      stat2Label: "Areas of work",
      stat3Value: "1:1",
      stat3Label: "Personal support",
    },
    services: {
      label: "— 02 / Services",
      headline: "What I",
      headlineAccent: "deliver.",
      /* Mirrors the German set one-for-one, same order, same reasoning —
         see the comment on the German block. */
      items: [
        {
          number: "01",
          title: "Digitalization for Businesses",
          description: "Lists kept by hand, figures from three places, the same retyping every day. I take one concrete workflow and make it simpler – not the whole business at once.",
          tags: ["Workflows", "Reporting", "Automation", "Integrations"],
        },
        {
          number: "02",
          title: "Digital Concepts",
          description: "You have an idea but no plan yet. I turn it into a concept you can read: what is needed, which route makes sense, what it costs.",
          tags: ["Requirements", "Clickable draft", "Effort", "Roadmap"],
        },
        {
          number: "03",
          title: "Custom Development",
          description: "Not every task needs a big program. Often it just needs the tool that fits your work: a spreadsheet template, a small application, a report.",
          tags: ["Spreadsheet template", "Small application", "Reporting", "Data import"],
        },
        {
          number: "04",
          title: "Web Presence",
          description: "Out of date, unclear or not there at all? Then people leave before they get in touch. I build new, bring existing sites up to standard – and maintain them.",
          tags: ["New website", "Rework", "Maintenance", "Findability"],
        },
        {
          number: "05",
          title: "Online Shop",
          description: "Your shop runs locally, now it should run online too. I plan, build and look after it – set up so items and stock can be managed from a phone.",
          tags: ["Online sales", "Product upkeep", "Stock by phone", "Support"],
        },
      ],
    },
    tech: {
      label: "Tech Stack",
      headline: "What I",
      headlineAccent: "work with.",
      body: "Tools that have proven themselves – not a matter of faith, just the right thing for the problem. Languages change; good architecture stays.",
    },
    portfolio: {
      label: "— 03 / Portfolio",
      headline: "Selected",
      headlineAccent: "projects.",
      comingSoon: "Coming soon",
      placeholderLabel: "Placeholder",
      items: [
        {
          number: "01",
          badge: "Web App",
          title: "Mid-market platform",
          description: "A custom-built web application for a mid-market client – individually developed, built to scale.",
          stack: ["Angular", "Node.js", "SQL"],
          imagePlaceholder:
            "Dashboard screenshot with central KPI overview, sidebar navigation on the left, detail panel on the right.",
        },
        {
          number: "02",
          badge: "Digitalization",
          title: "Process automation",
          description: "Automation of manual business processes through intelligent workflows and data pipelines.",
          stack: ["Python", "KNIME", "SQL"],
          imagePlaceholder:
            "Workflow diagram: KNIME nodes pulling data from three sources, validating it, writing into a SQL table.",
        },
        {
          number: "03",
          badge: "Web presence",
          title: "Brand presence",
          description: "Professional web presence for an established company – performant, accessible, individually crafted.",
          stack: ["WordPress", "TypeScript"],
          imagePlaceholder:
            "Hero mockup of the client site on desktop and mobile — quiet typography, large keystone image.",
        },
        {
          number: "04",
          badge: "App",
          title: "Internal business app",
          description: "Desktop application for internal process management – intuitively usable, cleanly documented.",
          stack: ["C#", "SQL", "Vue"],
          imagePlaceholder:
            "Desktop app screenshot: list view of orders with filter bar at the top and detail panel on the right.",
        },
      ],
    },
    process: {
      label: "— 04 / Process",
      headline: "How I",
      headlineAccent: "work.",
      body: "No rigid process. The weight shifts with the job. The four steps below are the usual frame, not a corset.",
      steps: [
        {
          number: "01",
          title: "Listening",
          duration: "To begin with",
          description: "You tell me where things get stuck. I keep asking – and say honestly whether building something is worth it.",
        },
        {
          number: "02",
          title: "Concept",
          duration: "Depends on scope",
          description: "What is needed, which route makes sense, what does it cost? The groundwork is there before any budget moves.",
        },
        {
          number: "03",
          title: "Delivery",
          duration: "As agreed",
          description: "I build it and show you where it stands. Changing course is cheap along the way and expensive afterwards.",
        },
        {
          number: "04",
          title: "Support",
          duration: "If you want it",
          description: "Handover, a walkthrough, and maintenance if you want it. Either way I stay your point of contact.",
        },
      ],
    },
    blog: {
      label: "— 05 / Journal",
      headline: "Thoughts &",
      headlineAccent: "articles.",
      readMore: "Read more",
      allPosts: "All articles",
      placeholderLabel: "Placeholder",
      /* Same slugs as the German fallback and as the seed migration in
         tds-ext-blog-cms-pkg — the slug is shared across languages, only the
         row differs. Changing one without the other points at a 404. */
      posts: [
        {
          category: "Digitalization",
          title: "Digitalization doesn't start with a big project.",
          excerpt: "It starts with the one routine that costs you hours every week – the one nobody but you can see.",
          date: "2026-08-04",
          slug: "digitalisierung-faengt-klein-an",
          imagePlaceholder:
            "A handwritten list on a clipboard beside a laptop — warm morning light, workshop in the background.",
        },
        {
          category: "Online shop",
          title: "Is an online shop worth it for my local business?",
          excerpt: "Not for every range of products. Four questions that usually answer it for you.",
          date: "2026-07-21",
          slug: "lohnt-sich-ein-webshop",
          imagePlaceholder:
            "A shop counter from above — products, a notepad and a phone showing an open product list.",
        },
        {
          category: "Tools",
          title: "Spreadsheet or a tool of your own?",
          excerpt: "A spreadsheet carries you surprisingly far. There are three points, though, where it reliably tips over.",
          date: "2026-07-07",
          slug: "excel-oder-eigenes-werkzeug",
          imagePlaceholder:
            "A screen showing a spreadsheet scrolled far down, next to a sticky note with a fragment of a formula.",
        },
      ],
    },
    contact: {
      label: "— 06 / Contact",
      headline: "Let's",
      headlineAccent: "talk.",
      sub: "Tell me in two sentences where things are getting stuck. I usually respond within 24 hours.",
      form: {
        name: "Name",
        namePlaceholder: "Alex Marlow",
        email: "Email",
        emailPlaceholder: "alex@marlow.studio",
        company: "Company (optional)",
        companyPlaceholder: "Marlow Studios",
        message: "Message",
        messagePlaceholder: "We still keep our prices in three separate lists — it costs us half a day every week.",
        consent: "I consent to the processing of my data in accordance with the",
        consentLink: "Privacy Policy",
        consentSuffix: ".",
        submit: "Send message",
        submitting: "Sending …",
        successTitle: "Message received!",
        successMessage: "Thank you for your message. I'll get back to you within 24 hours.",
        errorMessage: "Something went wrong. Please try again.",
      },
      info: {
        emailLabel: "Email",
        phoneLabel: "Mobile",
        locationLabel: "Location",
        socialLabel: "Social",
        email: "contact@tracht-digital.de",
        phone: "+49 178 822 4022",
        location: "Schwarzenbek · near Hamburg",
      },
    },
    pricing: {
      label: "— Pricing",
      headline: "Transparent",
      headlineAccent: "hourly rates.",
      sub: "Clear pricing, no opaque packages. Billed by the actual hour, honestly estimated, with a ceiling you can rely on.",
      teaserLabel: "Pricing",
      teaserHeadline: "Clear rates,",
      teaserHeadlineAccent: "no packages.",
      teaserSub: "From €95 per hour – billed by the actual hour, no hidden fees.",
      teaserCta: "See all hourly rates",
      teaserFromLabel: "from",
      hourSuffix: "/ hour",
      includesLabel: "Included:",
      items: [
        {
          title: "Consulting & Strategy",
          rate: 120,
          description:
            "Strategic guidance, architecture workshops, technical reviews. You end up with a clear written concept — not just slides.",
          includes: [
            "Capturing and sorting your requirements",
            "Architecture and requirements workshops",
            "Code and stack reviews with documented recommendations",
            "Written concepts and decision-making input",
          ],
          highlight: false,
        },
        {
          title: "Web & App Development",
          rate: 105,
          description:
            "Frontend, backend, mobile and desktop apps. Cleanly built, tested, documented – still maintainable in two years.",
          includes: [
            "Component development (React, Vue, Angular)",
            "API and backend development (Node.js, C#, SQL)",
            "Mobile and desktop apps",
            "Tests, CI/CD and documentation included",
          ],
          highlight: true,
        },
        {
          title: "Digitalization & Automation",
          rate: 105,
          description:
            "Replacing manual processes with workflows, data pipelines and integrations. Concrete work, no PowerPoint.",
          includes: [
            "On-site or remote process analysis",
            "Workflow automation (Python, KNIME, n8n)",
            "Data pipelines, ETL and SQL reporting",
            "Integration of existing tools and systems",
          ],
          highlight: false,
        },
        {
          title: "Maintenance & Support",
          rate: 85,
          description:
            "Maintaining existing systems, rolling out updates, fixing bugs. Response times by agreement.",
          includes: [
            "Bug fixes and hotfixes",
            "Dependency and security updates",
            "Monitoring and performance optimization",
            "Optional monthly retainer model",
          ],
          highlight: false,
        },
        {
          title: "Workshops & Training",
          rate: 135,
          description:
            "Sharing knowledge instead of hoarding it. Workshops for your team – from TypeScript basics to architecture.",
          includes: [
            "On-site or remote workshops",
            "Tailored training materials",
            "Hands-on exercises with your real code",
            "Follow-up call and recording included",
          ],
          highlight: false,
        },
      ],
      notesTitle: "Good to know",
      notes: [
        "All prices exclude German VAT (19 %).",
        "Day rate available on request — discount for 5+ days per month.",
        "Fixed price possible when the scope is clear up front.",
        "Travel costs are billed separately.",
      ],
      ctaTitle: "Sounds like a fit?",
      ctaSub: "Tell me briefly what it's about. I'll tell you honestly whether and how I can help.",
      ctaButton: "Get in touch",
      back: "Back",
    },
    consulting: {
      label: "— Consulting",
      headline: "Listen first,",
      headlineAccent: "build after.",
      body: "Maybe you have a clear plan, maybe just a feeling that something ought to be simpler. Either is a good place to start.",
      primaryCta: "Get in touch",
      secondaryCta: "See services",
    },
    footer: {
      slogan: "Digital solutions that truly fit.",
      tagline: "Personal, tailored, all from one source — from Schwarzenbek near Hamburg.",
      nav: "Navigation",
      contactTitle: "Contact",
      copyright: "© 2026 Tracht Digital Solutions. All rights reserved.",
      impressum: "Legal Notice",
      datenschutz: "Privacy Policy",
      pricing: "Pricing",
    },
    errors: {
      name: "Please enter your name.",
      email: "Please enter a valid email address.",
      message: "At least 20 characters, please.",
      consent: "Consent required.",
    },
    cookieNotice: {
      label: "Cookie and privacy notice",
      siteText:
        "This website does not use tracking cookies. Only technically necessary preferences (e.g. your colour scheme) are stored locally in your browser.",
      panelText:
        "This area only uses one technically necessary cookie for secure sign-in (session cookie). No tracking takes place.",
      privacy: "More in the privacy policy.",
      accept: "Got it",
      consentText:
        "This blog shows advertising from Google AdSense. With your consent — and only then — cookies and similar technologies are set for advertising. Your choice is free and can be changed at any time.",
      consentAccept: "Accept",
      consentDecline: "Decline",
    },
    toast: {
      dismiss: "Dismiss",
    },
  },
} as const;

export type Language = keyof typeof translations;
export type Translations = typeof translations.de;
