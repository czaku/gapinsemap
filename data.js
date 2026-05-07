// Campaign data — edit freely. All copy that goes into emails or share text lives here.

window.CAMPAIGN = {
  site: {
    name: "Gap in SE Map",
    url: "https://gapinsemap.london",      // change once domain is live
    tagline: "Bring back our stations. Build the Bakerloo. Reconnect South London.",
  },

  // Backend API (Cloudflare Worker). Set the URL below after `wrangler deploy`
  // outputs your Worker URL. Until then, the form falls back to console capture.
  api: {
    url: "",                                // e.g. "https://gapinsemap-api.czaku.workers.dev"
  },

  // Encryption — see crypto.js + tools/keygen.mjs.
  // The PRIVATE key never appears in this file. Anywhere.
  crypto: {
    publicKey: "q8tHQuUa2SBpvFe20Znlr49WPzmNr2jlL36OCe3qjxs=",  // base64 X25519 public key
  },

  mps: {
    florence: {
      name: "Florence Eshalomi MP",
      constituency: "Vauxhall and Camberwell Green",
      email: "florence.eshalomi.mp@parliament.uk",
    },
    miatta: {
      name: "Miatta Fahnbulleh MP",
      constituency: "Peckham",
      email: "miatta.fahnbulleh.mp@parliament.uk",
    },
    neil: {
      name: "Neil Coyle MP",
      constituency: "Bermondsey and Old Southwark",
      email: "neil.coyle.mp@parliament.uk",
    },
    ellie: {
      name: "Ellie Reeves MP",
      constituency: "Lewisham West and East Dulwich",
      email: "ellie.reeves.mp@parliament.uk",
    },
  },

  mayor: {
    name: "Sadiq Khan",
    role: "Mayor of London",
    email: "mayor@london.gov.uk",
  },

  tfl: {
    project: "Bakerloo Line Extension team",
    email: "ble@tfl.gov.uk",
  },

  // ---------------- Email templates ----------------
  emails: {
    mp: ({ mp }) => ({
      to: mp.email,
      subject: `Constituent — Walworth & Camberwell still have no station`,
      body:
`Dear ${mp.name.replace(/ MP$/, "")},

I'm writing as your constituent in ${mp.constituency}. I live in the most precise version of what is sometimes loosely called the "South London transport black hole": Walworth (SE17) and the centre of Camberwell (SE5), where there is no Underground, no Overground, no DLR and no National Rail station — despite being in zone 1 and 2, and despite the Loughborough Junction → Elephant Thameslink line running through both areas without stopping.

Approximately 85,000 residents live in this specific desert. Old Kent Road, the gap's eastern artery, is being developed for 12,000+ new homes under the Mayor's Opportunity Area designation and is already running 60 buses an hour at capacity. Two stations — Walworth Road (closed 1916) and Camberwell (closed 1916) — sit on a line that still runs trains over their old platforms today. They were closed as a wartime emergency measure and never reopened, while wealthier-area stations were.

I welcome the proposed Bakerloo line extension. I want it built. But I am writing because, on close inspection, the BLE as currently proposed serves only the eastern half of the gap (Old Kent Road, New Cross Gate, Lewisham) and leaves Walworth Road, Camberwell Green and Denmark Hill with no new station at all. The 1940s plan for a Bakerloo branch through Camberwell was scrapped and has never been seriously revived.

I would like to ask you, specifically:

1. Will you publicly back the reopening of Walworth Road and Camberwell stations on the existing Thameslink line, and press TfL and the DfT to add them to the next round of the New Stations Fund (or its successor)? TfL's 2014 feasibility study costed both at well under £100m combined.

2. Will you press the Mayor and TfL to formally consider a "west arm" of the Bakerloo extension — Elephant → Walworth Road → Camberwell Green → Loughborough Junction → Brixton (creating a Bakerloo-to-Victoria-line interchange) — in the next BLE feasibility revision, rather than continuing to treat the western half of the gap as out of scope?

3. Will you publicly support full funding of the existing (eastern) Bakerloo extension proposal in the upcoming Spending Review?

4. Will you back Lewisham Council's Surrey Canal Road overground station so construction can begin in 2026 on schedule?

The Mayor has a statutory duty under the Greater London Authority Act 1999 — specifically s.141(1) ("the Mayor shall develop and implement policies for the promotion and encouragement of safe, integrated, efficient and economic transport facilities and services to, from and within Greater London") and s.142(2) (the Transport Strategy must contain proposals for accessible transport "and shall specify a timetable for the implementation of those proposals"). TfL has a Public Sector Equality Duty under s.149(1) of the Equality Act 2010. On any reasonable reading, the indefinite absence of any rail provision for ~85,000 residents in zones 1–2, while the surrounding network is repeatedly upgraded, is not consistent with these duties.

5. Will you support the residents' interim demand that — for as long as the Mayor remains in non-compliance with the duties above — the GLA and TfL fund free Lime and Forest e-bike hire (a modest indicative ~£30/month/resident) for verified residents of SE17, SE5, SE1 and SE15, until Walworth Road station reopens to passenger service?

I would be grateful for a written response setting out your position on each of the points above and any actions you intend to take.

Best wishes,
[Your name]
[Your address — must be in the constituency for casework rules]
[Your postcode]

PS: I support the campaign at gapinsemap.london and would welcome a meeting with other affected residents.`,
    }),

    mayor: () => ({
      to: "mayor@london.gov.uk",
      subject: "Walworth & Camberwell — the western half of the south London transport gap",
      body:
`Dear Mr Mayor,

I am writing about Walworth (SE17) and central Camberwell (SE5): two adjacent inner-London neighbourhoods, in zones 1 and 2, with approximately 85,000 residents and no rail station of any kind. The Loughborough Junction → Elephant Thameslink line operates trains through both areas every few minutes without stopping; Walworth Road (1916) and Camberwell (1916) stations were closed as a wartime emergency and never reopened.

I welcome the proposed Bakerloo line extension and want it built in full. However, the current proposal serves only the eastern half of the gap (Old Kent Road → New Cross Gate → Lewisham). It does not deliver a new station at Walworth Road, Camberwell Green or Denmark Hill. The 1940s Bakerloo extension to Camberwell — which appeared on the official tube map — was scrapped and has not been seriously reconsidered. Camberwell's residents have effectively been written out of every iteration of the plan.

You have, under the Greater London Authority Act 1999 (sections 141 and 142), a statutory duty to develop and implement policies that promote safe, integrated, efficient and economic transport across London, and to publish a strategy with a timetable for accessibility. You and TfL also have a Public Sector Equality Duty under section 149 of the Equality Act 2010. The indefinite, undocumented absence of any rail provision for ~85,000 residents — sitting in Southwark's most deprived north-central belt (Faraday ward: 31% child poverty) — is not consistent with any of these duties, and we are not aware of any published Equality Impact Assessment that justifies the current scope decision on the BLE.

I am asking you to:

1. Direct TfL to refresh the 2014 feasibility study for reopening Walworth Road and Camberwell stations on the existing Thameslink line, and identify a delivery route — including joint funding with Southwark Council and Old Kent Road Section 106 / CIL contributions. Add both to the next New Stations Fund round (or successor).

2. Direct TfL, in the next Bakerloo Line Extension feasibility revision, to formally cost and consult on a "west arm" — Elephant → Walworth Rd → Camberwell Green → Loughborough Junction → Brixton — alongside the existing east arm. A Brixton terminus would create the first new Underground-to-Underground interchange south of the river in decades (Bakerloo ↔ Victoria), unlocking network-level ridership benefits well beyond the immediate corridor.

3. Make securing Treasury funding for the (existing east) Bakerloo Line Extension a stated top-three transport priority, and publicly press for its inclusion in the multi-year capital settlement.

4. Use the GLA's leverage and the Mayor's Transport Strategy to ensure Surrey Canal Road overground station opens by 2028 as currently scheduled.

5. While these long-term measures are progressed, fund free Lime and Forest e-bike hire (indicative ~£30/month/verified-resident) for residents of SE17, SE5, SE1 and SE15, drawing on existing TfL active-travel and bus subsidy budgets, until Walworth Road station reopens to passenger service or April 2030, whichever comes first. This is a modest, time-bound substitution mechanism that recognises the real cost residents are paying for the gap. Operators (Lime, HumanForest) already partner with TfL; the agreement template exists. Total indicative cost ~£12.6m/year — approximately 0.25% of the BLE capital cost.

I support the residents' campaign at gapinsemap.london and would welcome an opportunity to give evidence to the Mayor's office or the Transport Committee of the London Assembly.

Yours sincerely,
[Your name]
[Your full postal address]`,
    }),

    tfl: () => ({
      to: "ble@tfl.gov.uk",
      subject: "Bakerloo line extension — support, plus a request to study the west arm",
      body:
`Hello,

Please log this message under both public support and feedback on the scheme.

I support the proposed Bakerloo line extension from Elephant & Castle to Lewisham via Old Kent Road and New Cross Gate, and the safeguarded onward extension to Hayes / Beckenham Junction. I want it built in full. I would like TfL to commit to:

1. Opening at least one of the new stations within 10 years of construction commencement.
2. Publishing — annually — the current funding-bid status with the DfT and HM Treasury so residents can track political progress.

I also want to record formal feedback on a structural omission in the current plan. The proposed route serves only the eastern half of the so-called south London transport gap. Walworth, Camberwell Green and Denmark Hill — collectively home to approximately 85,000 residents in zones 1 and 2 with no rail station of any kind — receive no new station under the current proposal. This is despite:

- A 1940s plan to extend the Bakerloo line through Camberwell appearing on the official tube map and never being formally rebutted.
- A 2014 TfL feasibility study costing the reopening of Walworth Road and Camberwell stations on the existing Thameslink line at well under £100m combined.
- Ongoing development pressure from the Old Kent Road Opportunity Area (12,000+ homes by 2041) which loads new demand onto a corridor that already lacks rail provision.

I would therefore ask TfL to:

3. Include in the next BLE feasibility revision a formally costed "west arm" option — Elephant & Castle → Walworth Road → Camberwell Green → Loughborough Junction → Brixton (Bakerloo-to-Victoria interchange) — and consult on it alongside the eastern proposal. A tube-to-tube interchange at Brixton would deliver network-level ridership uplift well beyond the immediate corridor.

4. Refresh the 2014 reopening study for Walworth Road and Camberwell stations and submit them for the next round of the New Stations Fund or its successor.

Please confirm receipt and add me to any future consultation distribution list.

I am also supporting the residents' campaign at gapinsemap.london.

Best wishes,
[Your name]
[Your postcode]`,
    }),
  },

  share: {
    text: "There's a gap in SE map. 85,000 Londoners in Walworth & Camberwell — zone 1–2, no station, line still running through. The Bakerloo extension only fixes half of it. Campaign → ",
  },
};
