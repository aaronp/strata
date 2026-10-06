<!--
Presentation source: Current Situation
Prepared: 2026-10-06
Scope: Current-state pain only. Future-state and next-step branches are not yet drafted.

Parsing conventions:
- Heading depth defines parentage; siblings form the horizontal sequence.
- A section's slide body excludes descendant sections.
- Each heading is immediately followed by slug: <unique-short-slug>.
- Slug lines and this comment are metadata, not slide content.
- Internal navigation uses [link:<slug>][label].
- External sources use ordinary Markdown links.
- Slugs are stable identifiers; titles and sibling order may change independently.
- Every slug is globally unique in this document.
- Examples, cases, regulations and guidance are distinguished explicitly.
- Documented incidents illustrate consequences, not measured prevalence.
- UK regulatory context and EU/US examples retain their jurisdiction labels.
- Source links were gathered in the accompanying discussion on 2026-10-06.
-->

# Current Situation
slug: current

Our digital lives span many services. We do much of the work of keeping them connected, accurate and under control.

**The cost:** repeated work, lasting exposure, restricted choices and difficulty getting help.

- [link:starting-again][We keep starting again.]
- [link:information-everywhere][We leave information everywhere.]
- [link:portability][What we build doesn't travel with us.]
- [link:delegation][We keep rebuilding who can act for whom.]

## We Keep Starting Again
slug: starting-again

“I've already supplied this information.”

Each new service can mean another form, another check and another record to maintain.

**Why it matters:** Everyday inconvenience becomes a substantial burden during job hunting, moving, illness or bereavement.

- [link:repeat-information][We Repeat Our Information]
- [link:repeat-proofs][We Repeat Our Proofs]
- [link:separate-records][We Maintain Separate Versions of Ourselves]

### We Repeat Our Information
slug: repeat-information

Each service asks us to describe ourselves again.

- Upload a CV, then retype employment history.
- Enter household or vehicle details into multiple comparison sites.
- Supply identity and address information to another provider.

**Why it matters:** Repeated administration costs time, introduces mistakes and delays access.

- [link:job-application][Example: Applying for a Job]
- [link:fca-repetition][Finding: Repeating Sensitive Information]

#### Example: Applying for a Job
slug: job-application

**Hypothetical example**

A candidate already has a CV, qualifications and references.

For each application, they create an account, upload their CV, re-enter its contents and track progress in another portal.

**Consequence:** The applicant becomes the coordinator of many separate versions of the same information.

#### Finding: Repeating Sensitive Information
slug: fca-repetition

**Documented finding · UK FCA · April 2025**

A review of bereavement and power-of-attorney journeys found repeated information requests and cases delayed or lost in firms' systems. Fragmented internal systems contributed.

**Consequence:** Repetition can cause distress and delay essential tasks, even within one organisation.

[Source: FCA review](https://www.fca.org.uk/publications/multi-firm-reviews/retail-banks-treatment-customers-vulnerable-circumstances-multi-firm-review)

### We Repeat Our Proofs
slug: repeat-proofs

Something established in one place may need checking again elsewhere.

- Employers verify the same qualification.
- Services separately check age, residency or membership.
- Providers ask for evidence of authority to help a relative.

**Why it matters:** People repeat work and organisations repeat verification.

- [link:carer-checks][Example: One Carer, Three Agencies]

#### Example: One Carer, Three Agencies
slug: carer-checks

**Hypothetical example**

A qualified carer joins three agencies. Each requests certificates, identity evidence and references.

**Consequence:** The applicant repeats work; each agency incurs verification costs.

**Boundary:** Earlier checks may be outdated or unsuitable. The pain is avoidable repetition, not verification itself.

### We Maintain Separate Versions of Ourselves
slug: separate-records

One real-world change creates many digital updates.

- Moving home means updating many providers.
- Changing a name involves different processes and evidence.
- Correcting one record leaves other copies unchanged.

**Why it matters:** Information drifts out of date, creating errors and potential exposure.

- [link:old-address][Example: The Old Address]
- [link:accuracy][Regulation: Keeping Records Accurate]

#### Example: The Old Address
slug: old-address

**Hypothetical example**

Someone updates their address with several providers but misses one. Sensitive correspondence continues going to their former home.

**Consequence:** A forgotten administrative task becomes a privacy problem.

#### Regulation: Keeping Records Accurate
slug: accuracy

**Regulation · UK GDPR · Article 5(1)(d)**

Personal data must be accurate and, where necessary, kept up to date. Organisations must take reasonable steps to correct or erase inaccurate data.

**Boundary:** This does not create automatic updates between independent providers.

[Source: ICO accuracy guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/accuracy/)

## We Leave Information Everywhere
slug: information-everywhere

“Who still has my details, and what happens to them?”

Each disclosure creates another dependency on someone else's security, retention and sharing practices.

**Why it matters:** The consequences can outlast the original benefit. Sensitive information cannot simply be reset like a password.

- [link:excess-disclosure][Small Tasks Can Involve Substantial Disclosure]
- [link:lasting-copies][Copies Can Outlive Their Purpose]
- [link:oversight][Oversight Becomes Difficult]

### Small Tasks Can Involve Substantial Disclosure
slug: excess-disclosure

The information requested can exceed what seems necessary for the immediate task.

- An age check may reveal an address and full birth date.
- A CV exposes personal and employment history.
- Finding friends may involve access to an address book.

**Why it matters:** More information is exposed than the person expected to share.

- [link:age-example][Example: Proving an Age Threshold]
- [link:minimisation][Regulation: Data Minimisation]

#### Example: Proving an Age Threshold
slug: age-example

**Hypothetical example**

A club needs to know whether someone meets an age threshold. It stores a full identity-document image containing additional information.

**Consequence:** The stored copy creates exposure beyond the eligibility question.

**Boundary:** What evidence is necessary depends on the purpose and verification requirements.

#### Regulation: Data Minimisation
slug: minimisation

**Regulation · UK GDPR · Article 5(1)(c)**

Personal data must be adequate, relevant and limited to what is necessary for the purpose.

**Why it matters:** Collecting information is a responsibility, even when collection is technically easy.

[Source: ICO data-minimisation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/?q=privacy)

### Copies Can Outlive Their Purpose
slug: lasting-copies

Finishing a task does not necessarily end storage or further use.

- Documents remain after an unsuccessful application.
- Forgotten accounts still hold information.
- Disconnecting an app does not necessarily delete received data.

**Why it matters:** Oversight becomes harder as old copies accumulate.

- [link:alexa][Case: Children's Alexa Recordings]
- [link:retention][Regulation: Storage Limitation]
- [link:google-signin][Clarification: Easier Sign-In Still Leaves Copies]

#### Case: Children's Alexa Recordings
slug: alexa

**Documented case · US FTC and DOJ · 2023**

Authorities alleged that Amazon retained children's recordings indefinitely unless parents requested deletion, and failed to remove some transcripts after deletion requests.

A settlement order was entered in July 2023.

**Consequence:** Requesting deletion and achieving it across underlying systems are different things.

[Source: FTC allegations](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-doj-charge-amazon-violating-childrens-privacy-law-keeping-kids-alexa-voice-recordings-forever) · [Entered order and case record](https://www.ftc.gov/legal-library/browse/cases-proceedings/192-3128-amazoncom-alexa-us-v)

#### Regulation: Storage Limitation
slug: retention

**Regulation · UK GDPR · Article 5(1)(e)**

Identifiable personal data must not be retained longer than necessary for its purposes, subject to applicable exceptions.

**Boundary:** Closing an account does not require immediate deletion of every record. Some retention remains justified or required.

[Source: ICO storage-limitation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/?q=controller)

#### Clarification: Easier Sign-In Still Leaves Copies
slug: google-signin

**Provider documentation · Google**

Google says it does not use Sign in with Google information or activity for advertising or other Google products.

Removing the connection does not withdraw information already shared with the app.

**The supported concern:** Easier sign-in still leaves separate accounts and data copies—not evidence that this sign-in feature sells your activity.

[Source: Google explanation](https://support.google.com/accounts/answer/12921417?hl=en-8)

### Oversight Becomes Difficult
slug: oversight

We depend on many organisations and their suppliers.

- Security failures can expose information we cannot change.
- Information may be used for profiling or advertising.
- Retention and deletion processes differ between providers.

**Why it matters:** People cannot easily assess or oversee every organisation handling their information.

- [link:betterhelp][Case: BetterHelp Health Data]
- [link:avast][Case: Avast Browsing Data]
- [link:advanced][Case: A Breach Reaching into People's Homes]
- [link:23andme][Case: Sensitive Data That Cannot Be Reset]
- [link:advertising-incentives][Finding: Incentives to Collect More]

#### Case: BetterHelp Health Data
slug: betterhelp

**Documented case · US FTC · 2023**

A settlement resolved allegations that BetterHelp shared sensitive health information with advertising platforms despite privacy promises.

The final order required $7.8 million and prohibited sharing health data for advertising.

**Consequence:** Information supplied while seeking help can be used in unexpected ways.

[Source: FTC final order announcement](https://search.ftc.gov/news-events/news/press-releases/2023/07/ftc-gives-final-approval-order-banning-betterhelp-sharing-sensitive-health-data-advertising)

#### Case: Avast Browsing Data
slug: avast

**Documented case · US FTC enforcement · 2024**

The FTC finalised a $16.5 million settlement over allegations that Avast sold detailed browsing information while claiming its products protected users from tracking.

**Consequence:** Assessing trustworthiness is difficult even when privacy is part of the product's promise.

[Source: FTC final order announcement](https://www.ftc.gov/news-events/news/press-releases/2024/06/ftc-finalizes-order-avast-banning-it-selling-or-licensing-web-browsing-data-advertising-requiring-it)

#### Case: A Breach Reaching into People's Homes
slug: advanced

**Documented case · UK ICO · 2022 incident; 2025 fine**

The ICO reported stolen information relating to 79,404 people, including home-entry instructions for 890 people receiving care.

Attackers entered through a customer account without multi-factor authentication.

**Consequence:** People depend on suppliers they may never have knowingly chosen.

[Source: ICO Advanced enforcement announcement](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/03/software-provider-fined-3m-following-2022-ransomware-attack/)

#### Case: Sensitive Data That Cannot Be Reset
slug: 23andme

**Documented case · UK ICO · 2023 incident; 2025 fine**

The 23andMe breach affected 155,592 UK residents. Attackers used credentials stolen in unrelated breaches.

Exposed information varied and could include family connections and health reports.

**Consequence:** Failures across accounts can interact, and sensitive personal history cannot be reset like a password.

[Source: ICO 23andMe announcement](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/06/23andme-fined-for-failing-to-protect-uk-users-genetic-data/)

#### Finding: Incentives to Collect More
slug: advertising-incentives

**Documented finding · US FTC · September 2024**

An FTC study of major social and video platforms found extensive data collection and inadequate controls. Targeted-advertising incentives were in tension with privacy.

**Boundary:** This concerns particular markets, not every digital service. Selling targeted advertising and selling personal data are different practices.

[Source: FTC report announcement](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-staff-report-finds-large-social-media-video-streaming-companies-have-engaged-vast-surveillance)

## What We Build Doesn't Travel with Us
slug: portability

“Why do I have to rebuild everything to use another service?”

Our history, relationships and effort can be difficult to reuse, combine or carry elsewhere.

**Why it matters:** Switching can mean losing context, rebuilding credibility or taking on more coordination.

- [link:history][History and Reputation Stay Behind]
- [link:integration][We Become the Connection Between Our Tools]
- [link:platform-choice][Our Choices Depend on Everyone Else's Platform]

### History and Reputation Stay Behind
slug: history

Value established within one service may have little recognition outside it.

- Sellers rebuild their reputation on another marketplace.
- Community contributions remain tied to one platform.
- Moving work tools can lose context around decisions.

**Why it matters:** Leaving can mean giving up accumulated value.

- [link:seller][Example: Starting Again as a Seller]
- [link:portability-limits][Regulation: Portability Has Limits]

#### Example: Starting Again as a Seller
slug: seller

**Hypothetical example**

A seller with years of positive reviews joins another marketplace.

They can show screenshots, but the new service does not recognise those reviews as verified reputation.

**Consequence:** Switching means rebuilding commercial credibility.

**Boundary:** A different marketplace may reasonably assess reputation differently.

#### Regulation: Portability Has Limits
slug: portability-limits

**Regulatory guidance · UK GDPR Article 20 · ICO**

Data portability is a conditional right, not a right to transfer every kind of record.

The ICO explains that it does not require organisations to maintain technically compatible systems.

**Consequence:** Obtaining an export does not guarantee another service can use or recognise it.

[Source: ICO data-portability guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/?q=compliance)

### We Become the Connection Between Our Tools
slug: integration

People manually move information between services.

- Download a document, upload it elsewhere, then notify someone.
- Reconcile scattered bills, appointments and records.
- Copy changes between calendars, messages and task lists.

**Why it matters:** Useful combinations take effort to assemble and maintain.

- [link:appointment][Example: Coordinating an Appointment]
- [link:ico-smart-data][Finding: Export Is Not Integration]

#### Example: Coordinating an Appointment
slug: appointment

**Hypothetical example**

A family member finds an appointment in a portal, adds it to a calendar, messages a carer and updates shared notes.

The appointment changes. Each copy needs updating again.

**Consequence:** Coordination depends on someone remembering every place information was copied.

#### Finding: Export Is Not Integration
slug: ico-smart-data

**Documented regulatory observation · UK ICO · September 2025**

The ICO noted that transferred data may not be readily usable elsewhere without common standards or APIs.

Case-by-case portability requests also create friction for ongoing access.

**Consequence:** Obtaining a copy is different from connecting services into a useful workflow.

[Source: ICO evidence on Smart Data](https://ico.org.uk/media2/tkapjxv5/20250915-ico-response-to-dsit-call-for-evidence.pdf)

### Our Choices Depend on Everyone Else's Platform
slug: platform-choice

Choosing a tool can mean persuading others to join it.

- Club members need another account to participate.
- Family information is scattered across messaging apps.
- A specialist tool cannot easily fit the team's existing workflow.

**Why it matters:** Tool choice depends on the surrounding network, not only personal preference.

- [link:club-app][Example: Another App for the Club]
- [link:dma][Regulation: Messaging Interoperability]

#### Example: Another App for the Club
slug: club-app

**Hypothetical example**

A club chooses a new coordination app. Every member must join it or rely on someone forwarding information.

A member prefers another tool but cannot use it to participate fully.

**Consequence:** The group must standardise its platform or carry the burden of bridging platforms.

#### Regulation: Messaging Interoperability
slug: dma

**Regulation · EU Digital Markets Act · Article 7**

Designated messaging gatekeepers face phased requirements for specified interoperability with other providers on request.

The measure addresses strong network effects.

**Boundary:** This is a targeted EU obligation, not a requirement that every app communicate with every other app.

[Source: European Commission explanation](https://digital-markets-act.ec.europa.eu/businesses-portal/messaging-interoperability_en?prefLang=hu)

## We Keep Rebuilding Who Can Act for Whom
slug: delegation

“Our responsibilities changed. Why must we update every service separately?”

Real-world relationships do not reliably carry across digital services.

**Why it matters:** Legitimate help can be blocked, permissions can be excessive, and access can persist after responsibility ends.

- [link:groups][The Same Group Is Recreated Everywhere]
- [link:governance][Our Rules Do Not Fit Every Service]
- [link:shared-credentials][Helping Can Become Impersonation]
- [link:delegation-chains][Delegation Can Extend Beyond the First Helper]
- [link:stale-access][Access Can Outlast Responsibility]

### The Same Group Is Recreated Everywhere
slug: groups

Each service maintains its own picture of who belongs.

- Care circles span appointments, notes and support services.
- Committees recur in email, storage, finance and booking tools.
- Teams repeat access changes when members join or leave.

**Why it matters:** A change in membership creates many administrative tasks.

- [link:care-circle][Example: A New Carer Joins]
- [link:existing-group-access][Boundary: Group Access Already Exists]

#### Example: A New Carer Joins
slug: care-circle

**Hypothetical example**

A family agrees that a new carer should help a parent.

They separately arrange access to appointments, shared notes, deliveries and home-entry information.

**Consequence:** The carer can be responsible for helping before having the access needed to help.

#### Boundary: Group Access Already Exists
slug: existing-group-access

**Scope clarification**

Enterprise identity systems already support some cross-service group management, federation and provisioning.

The gap is their availability and suitability across independent services, families and informal groups.

**The pain:** People cannot assume their group's membership and governance will be recognised wherever they need to act.

### Our Rules Do Not Fit Every Service
slug: governance

Membership alone does not explain what someone may do.

- A carer can arrange appointments without seeing unrelated records.
- Spending may require two approvals.
- Only certain members can invite others or change permissions.

**Why it matters:** Groups must translate their rules into each service's available controls.

- [link:committee-spending][Example: The Committee's Spending Rule]
- [link:attorney-access][Finding: Authority Without Practical Access]

#### Example: The Committee's Spending Rule
slug: committee-spending

**Hypothetical example**

A club agrees that purchases need two committee members' approval.

One tool supports this; another gives every administrator unrestricted purchasing access.

**Consequence:** The group relies on manual oversight to enforce a rule its tools do not consistently express.

#### Finding: Authority Without Practical Access
slug: attorney-access

**Documented finding · UK FCA · April 2025**

The FCA found that attorneys often lacked app or online banking access. Some people and representatives could not access funds for essential bills.

**Boundary:** A legally appointed attorney has different powers from an informal care-circle member.

[Source: FCA review](https://www.fca.org.uk/publications/multi-firm-reviews/retail-banks-treatment-customers-vulnerable-circumstances-multi-firm-review) · [Announcement](https://www.fca.org.uk/news/press-releases/fca-probes-banks-bereavement-power-attorney-policies)

### Helping Can Become Impersonation
slug: shared-credentials

Where suitable delegation is unavailable, sharing credentials becomes a workaround.

- A relative uses a parent's login.
- Successive volunteers inherit a shared account.
- An assistant receives broad access for a narrow task.

**Why it matters:** It becomes harder to limit access, withdraw it selectively or identify who acted.

- [link:parent-login][Example: One Appointment, Whole Account]
- [link:least-privilege][Guidance: Limit Access to the Task]

#### Example: One Appointment, Whole Account
slug: parent-login

**Hypothetical example**

A parent shares a login so a relative can arrange one appointment.

The same login exposes messages, records and account settings.

**Consequence:** Permission for one task becomes the ability to act as the account holder.

#### Guidance: Limit Access to the Task
slug: least-privilege

**Security guidance · UK NCSC**

User and service identities should access only the data and services they need, when they need them.

**Why it matters:** A helper's access should reflect their task rather than inherit every power of the account holder.

[Source: NCSC cloud-access guidance](https://www.ncsc.gov.uk/collection/cloud/using-cloud-services-securely/using-a-cloud-platform-securely)

### Delegation Can Extend Beyond the First Helper
slug: delegation-chains

Helpers may involve other helpers.

- A coordinator assigns work to a temporary colleague.
- A department authorises teams, people and services.
- An AI assistant delegates tasks to sub-agents.

**Why it matters:** The original limits and accountability become harder to follow down the chain.

- [link:ai][AI Assistants and Sub-Agents]
- [link:access-guidance][Guidance: Identity, Conditions and Audit Records]

#### AI Assistants and Sub-Agents
slug: ai

An assistant may involve other assistants. Authority needs to remain understandable throughout the chain.

**The pain:** A narrow instruction can become a wider chain of access with unclear limits and responsibility.

- [link:ai-authority][Who Authorised This Action?]
- [link:ai-scope][What May Each Agent Do?]
- [link:ai-delegation][May It Delegate Further?]
- [link:ai-accountability][Who Actually Acted?]

##### Who Authorised This Action?
slug: ai-authority

An agent's request may arrive without a clear connection to the person or organisation that authorised it.

**Hypothetical example:** A booking agent claims to represent a customer, but the recipient sees only the agent's account.

**Why it matters:** A claim to represent someone is not evidence of permission.

##### What May Each Agent Do?
slug: ai-scope

An instruction can be narrower than the access granted.

**Hypothetical example:** “Find a hotel under £150” is accompanied by access that also permits purchases or changes to unrelated bookings.

**Why it matters:** Task limits and technical permissions can diverge.

[link:least-privilege][Read the guidance on limiting access]

##### May It Delegate Further?
slug: ai-delegation

Permission to act does not necessarily include permission to appoint another agent.

**Hypothetical example:** A travel assistant forwards a broad credential to a hotel-booking sub-agent.

**Why it matters:** Access spreads beyond the helper the person knowingly authorised.

##### Who Actually Acted?
slug: ai-accountability

Shared credentials can make actions by different agents appear to come from one account.

**Hypothetical example:** A booking is changed, but the record does not distinguish the user, their assistant and its sub-agent.

**Why it matters:** Understanding mistakes and responsibility becomes harder.

[link:access-guidance][Read the guidance on identity and audit records]

#### Guidance: Identity, Conditions and Audit Records
slug: access-guidance

**Security guidance · UK NCSC**

Identity-management policies should cover who or what may access systems, under which conditions, and appropriate audit records.

**Boundary:** These are underlying security principles, not a specific multi-agent regulation.

[Source: NCSC identity and access management](https://www.ncsc.gov.uk/collection/10-steps/identity-and-access-management)

### Access Can Outlast Responsibility
slug: stale-access

Ending a relationship requires finding its digital permissions.

- Former members retain access to connected services.
- Replacements lack access while previous carers still have it.
- Agents retain permissions after their tasks finish.

**Why it matters:** Who can act no longer matches who should act.

- [link:volunteer-access][Example: The Volunteer Who Left]
- [link:leavers-guidance][Guidance: Joiners, Movers and Leavers]
- [link:session-revocation][Boundary: Membership Changes and Existing Sessions]

#### Example: The Volunteer Who Left
slug: volunteer-access

**Hypothetical example**

A volunteer leaves a committee. Their email-group membership is removed, but a shared folder, booking account and automation token remain accessible.

**Consequence:** A single departure leaves several unresolved permissions.

#### Guidance: Joiners, Movers and Leavers
slug: leavers-guidance

**Security guidance · UK NCSC**

Manage access when people join, change roles and leave. Revoke access when no longer needed; remove or suspend unnecessary temporary accounts.

**Why it matters:** Granting access is only the beginning of its lifecycle.

[Source: NCSC identity and access management](https://www.ncsc.gov.uk/collection/10-steps/identity-and-access-management)

#### Boundary: Membership Changes and Existing Sessions
slug: session-revocation

**Technical boundary**

Changing group membership does not automatically invalidate every existing token or session.

Services must enforce suitable expiry, freshness checks or revocation.

**The pain:** A central decision to end someone's authority may not immediately end their practical access.


