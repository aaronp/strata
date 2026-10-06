<!--
Presentation source: Digital Wallet Future
Prepared: 2026-10-06
Scope: What this wallet approach is and enables. How it works and Next Steps remain out of scope.
Status: Intended capabilities and illustrative scenarios; not an audit of implemented or conformant features.
Heading depth defines parentage; siblings define horizontal navigation.
Each section body excludes descendants. slug: lines and comments are metadata.
Internal links use [link:<slug>][label]; source URLs use standard Markdown.
Slugs are unique across this module and current-situation.md.
This module is self-contained: all internal links resolve within this file.
Current-state connections are plain-text context, not cross-file navigation.
The separate digital-wallet-story.md retains cross-links in its combined narrative.
No new emoji or graphic metadata is added; presentation assets remain independent.
Sources are the primary references reviewed in the accompanying discussion.
-->

# Digital Wallet Future
slug: future

Carry your identity, evidence and authority between services, so your digital life can work together under your control.

**The opportunity:** less repetition and exposure, greater continuity, safer cooperation and more useful combinations of services.

- [link:wallet][What It Is]
- [link:wallet-impact][What It Enables]
- [link:wallet-foundation][The Foundation Behind These Outcomes]
- [link:impact-map][How This Answers the Current Situation]

## What It Is
slug: wallet

A wallet for managing identities, evidence, relationships and rules that participating services can recognise.

It helps you bring something useful to a service—and retain useful evidence of what happens there.

- [link:wallet-contents][Identity, Evidence and Authority]
- [link:return-valve][A Return Valve for Your Digital Life]
- [link:wallet-identities][People, Groups, Devices and Agents]

### Identity, Evidence and Authority
slug: wallet-contents

- **Identity:** who you, your group or your agent are.
- **Evidence:** things others have confirmed, with origins that can be checked.
- **Relationships:** who belongs and who represents whom.
- **Rules:** conditions for sharing information or allowing actions.

**Why it matters:** These can remain useful beyond the application where they began.

### A Return Valve for Your Digital Life
slug: return-valve

Services receive your information and effort. They can also return useful evidence: a qualification, decision, purchase or completed task.

Your wallet holds receipts in a form it can query when a service asks for evidence.

**Why it matters:** Your activity can keep working for you elsewhere.

[link:receipt-workflows][Explore services building on receipts]

### People, Groups, Devices and Agents
slug: wallet-identities

An individual can use several devices. People can form groups. Groups can include other groups and authorise services or agents.

These relationships need distinguishable identities and responsibilities.

**Why it matters:** A helper or device need not become another copy of your login.

[link:shared-authority][Explore relationships and authority]

## What It Enables
slug: wallet-impact

Six areas of impact connect the current frustrations to practical outcomes.

The first four address recurring burdens. The final two expand what people can do across services.

- [link:reuse-evidence][Reuse What You Have Already Established]
- [link:minimal-sharing][Share Less, with Clearer Intent]
- [link:keep-value][Keep Your Identity and Accumulated Value]
- [link:shared-authority][Express Who Can Act for Whom]
- [link:receipt-workflows][Combine Services into Your Own Workflows]
- [link:private-discovery][Find What Fits Your Life, Privately]

### Reuse What You Have Already Established
slug: reuse-evidence

Carry useful evidence forward instead of repeatedly reconstructing and verifying it.

**For people:** less repeated administration.
**For providers:** less avoidable checking.

**Current pain:** We keep starting again.

- [link:reusable-claims][Bring Evidence You Already Have]
- [link:reusable-details][Supply Relevant Information Once More Easily]
- [link:current-evidence][Distinguish Old Evidence from Current Evidence]
- [link:reuse-boundaries][What This Depends On]

#### Bring Evidence You Already Have
slug: reusable-claims

Qualifications, memberships, eligibility and organisational roles can be presented to other services that accept them.

**Why it matters:** A new service does not always need to establish every fact from scratch.

- [link:reusable-carer][Example: One Qualification, Several Agencies]

##### Example: One Qualification, Several Agencies
slug: reusable-carer

**Illustrative scenario**

A carer presents qualification evidence from an issuer accepted by several agencies.

Each agency can check the origin and relevant status.

**Benefit:** Less repeated document handling, while each agency retains its acceptance decisions.

#### Supply Relevant Information Once More Easily
slug: reusable-details

Draw selected information from existing records rather than manually reconstructing it.

**Why it matters:** Fewer forms to retype and fewer accidental inconsistencies.

- [link:wallet-application][Example: Applying for a Role]

##### Example: Applying for a Role
slug: wallet-application

**Illustrative scenario**

A candidate provides selected employment and qualification information from their wallet.

**Benefit:** Less repeated entry; only relevant evidence is shared.

**Condition:** The receiving application must support the supplied information and format.

#### Distinguish Old Evidence from Current Evidence
slug: current-evidence

A credential's origin and its current validity answer different questions.

Connected services can reassess relevant claims as status changes.

**Why it matters:** Reusable evidence need not mean relying indefinitely on old facts.

[link:changing-authority][Explore lifecycle changes]

#### What This Depends On
slug: reuse-boundaries

Recipients still choose which issuers, evidence and freshness requirements they accept.

Earlier checks may be outdated or unsuitable for a new purpose.

**The promise:** Reduce avoidable repetition while preserving necessary verification.

### Share Less, with Clearer Intent
slug: minimal-sharing

Provide the information needed for a decision, with less unnecessary disclosure.

**For people:** reduced exposure.
**For providers:** less unnecessary personal information to safeguard.

**Current pain:** We leave information everywhere.

- [link:eligibility-proof][Prove the Relevant Condition]
- [link:selected-claims][Reveal Selected Claims]
- [link:operator-burden][Reduce Unnecessary Data Custody]
- [link:sharing-boundaries][What This Depends On]

#### Prove the Relevant Condition
slug: eligibility-proof

A service may need evidence of eligibility rather than a full personal document.

**Why it matters:** A narrow decision need not routinely require a broad dossier.

- [link:bartender][Example: The Bartender's Question]
- [link:age-proof-boundary][What This Depends On]

##### Example: The Bartender's Question
slug: bartender

**Illustrative scenario**

A bartender receives acceptable evidence that a customer meets the age threshold.

The customer's address and full birth date are not needed for that decision.

**Benefit:** The customer discloses less; the bartender handles less sensitive information.

##### What This Depends On
slug: age-proof-boundary

Presenting an issued “over 18” claim differs from deriving an age-threshold proof from a hidden birth date.

The latter requires a suitable proof mechanism.

**The promise:** Minimal disclosure supported by the actual credential and proof design.

#### Reveal Selected Claims
slug: selected-claims

Disclose the relevant parts of evidence when the credential format supports it.

**Why it matters:** A service can verify a useful assertion without automatically receiving everything else in the credential.

[link:disclosure-foundation][Explore the privacy foundation]

#### Reduce Unnecessary Data Custody
slug: operator-burden

Design the service around the decision it needs to make.

Collect and retain only what is justified for that purpose.

**Why it matters:** Less unnecessary data can reduce storage, oversight and security burdens.

**Current pain:** Small tasks can involve substantial disclosure.

#### What This Depends On
slug: sharing-boundaries

Disclosure may still reveal identity or enable correlation.

A wallet cannot guarantee deletion or control every use of information after a recipient receives it.

**The promise:** Reduce what must be disclosed, rather than imply all disclosure can be undone.

### Keep Your Identity and Accumulated Value
slug: keep-value

Retain continuity and useful records as devices, tools and providers change.

**Why it matters:** Changing a service need not mean starting your digital life again.

**Current pain:** What we build does not travel with us.

- [link:identity-continuity][Continue Across Device and Key Changes]
- [link:provider-choice][Choose Where Your Wallet Is Supported]
- [link:portable-records][Carry Useful Records Forward]
- [link:portability-boundaries][What This Depends On]

#### Continue Across Device and Key Changes
slug: identity-continuity

A continuing identity can be associated with updated control keys.

A lost or replaced device need not define a new person.

**Why it matters:** Identity can outlast particular devices, subject to a sound recovery and key-management design.

#### Choose Where Your Wallet Is Supported
slug: provider-choice

Aim to retain usable identities and records when changing wallet or hosting providers.

**Why it matters:** Provider choice becomes meaningful when migration is practical.

**Required evidence:** Export, recovery and use with an alternative implementation—not just a promise of portability.

#### Carry Useful Records Forward
slug: portable-records

Keep receipts, credentials and relevant relationship records beyond their original service.

**Why it matters:** Accumulated effort can remain available for new uses.

- [link:community-migration][Example: Changing Community Software]

##### Example: Changing Community Software
slug: community-migration

**Illustrative scenario**

A community changes administration tools while retaining its identity, membership evidence and records of approved decisions.

**Benefit:** The community's history need not be defined by the software currently hosting it.

#### What This Depends On
slug: portability-boundaries

Identity continuity, data portability and acceptance by another service are distinct capabilities.

Key ownership alone does not guarantee that contacts, stored records or reputation remain usable elsewhere.

**The promise:** Demonstrable continuity and migration, not automatic compatibility with every provider.

### Express Who Can Act for Whom
slug: shared-authority

Make groups, responsibilities and delegated authority usable across services.

**Why it matters:** Help and cooperation need not depend on sharing credentials.

**Current pain:** We keep rebuilding who can act for whom.

- [link:group-relationships][Represent Groups and Their Relationships]
- [link:trust-rules][Bring Your Own Trust Rules]
- [link:scoped-delegation][Delegate Tasks, Not Your Whole Account]
- [link:changing-authority][Let Services Follow Changing Authority]

#### Represent Groups and Their Relationships
slug: group-relationships

Express people belonging to groups, groups belonging to organisations, and services acting for those groups.

**Why it matters:** Participating services can rely on relevant relationships instead of recreating every membership independently.

- [link:wallet-care-circle][Example: A Care Circle]

##### Example: A Care Circle
slug: wallet-care-circle

**Illustrative scenario**

A family defines a care circle around a parent.

Carers may organise appointments; designated family members handle financial decisions.

**Benefit:** The relationship and the permitted activity remain distinct.

#### Bring Your Own Trust Rules
slug: trust-rules

Choose whose assurances count for a particular decision.

- A school establishes who teaches a child.
- A parent decides what those teachers may access.
- A service enforces the accepted rule.

**Why it matters:** Different parties retain authority over the decisions they are best placed to make.

- [link:teacher-policy][Example: My Child's Teachers]
- [link:business-policy][Example: A Local Business Offer]
- [link:trust-boundaries][What This Depends On]

##### Example: My Child's Teachers
slug: teacher-policy

**Illustrative scenario**

A parent permits access to selected learning information for people currently recognised as their child's teachers by an accepted school.

**Benefit:** The rule refers to a meaningful relationship instead of a manually maintained list of accounts.

##### Example: A Local Business Offer
slug: business-policy

**Illustrative scenario**

A community service offers a benefit to local business owners recognised by a chosen organisation.

**Benefit:** The service states which evidence it accepts without independently rebuilding the whole verification process.

##### What This Depends On
slug: trust-boundaries

Trust is specific to the assertion and purpose.

Accepting a school's teaching assertions does not authorise it to approve payments.

Group membership alone does not establish every action a member may perform.

#### Delegate Tasks, Not Your Whole Account
slug: scoped-delegation

Give a helper or agent a distinguishable identity and relevant authority.

Define what it may do, whether it may delegate further and who authorised the action.

**Why it matters:** Narrow instructions need not require broad impersonation.

**Current pain:** Helping can become impersonation.

- [link:wallet-agent-chain][Example: An Assistant That Hires an Assistant]

##### Example: An Assistant That Hires an Assistant
slug: wallet-agent-chain

**Illustrative scenario**

A travel assistant may book within an agreed budget and delegate accommodation search to a sub-agent.

Search authority does not automatically include payment authority.

**Benefit:** The principal, assistant and sub-agent remain distinguishable, with explicit limits.

**Current agent-delegation questions:** Who authorised the action? What may each agent do? May it delegate further? Who actually acted?

#### Let Services Follow Changing Authority
slug: changing-authority

Participating services can react when relevant facts change.

- A carer joins or leaves.
- A qualification expires.
- A group's approval rule changes.
- An agent's assignment ends.

**Why it matters:** Less duplicated administration and less drift between responsibility and access.

- [link:authority-freshness][What This Depends On]

##### What This Depends On
slug: authority-freshness

Publishing a change does not automatically end every session or invalidate every token.

Services need suitable status checks, expiry, revocation and failure behaviour.

**The promise:** Coordinated enforcement of changes, with explicit limits on stale access.

### Combine Services into Your Own Workflows
slug: receipt-workflows

Let services recognise and build on one another's outputs.

**Why it matters:** You can combine specialist tools instead of requiring one platform to do everything.

**Current pain:** We become the connection between our tools.
**Current pain:** Our choices depend on everyone else's platform.

- [link:useful-receipts][Get Something Useful Back]
- [link:explicit-reliance][Make Reliance Explicit]
- [link:reactive-workflows][React to Relevant Events]
- [link:decision-lineage][Trace the Basis of a Decision]
- [link:workflow-boundaries][What This Depends On]

#### Get Something Useful Back
slug: useful-receipts

A service can return evidence of a meaningful outcome: a decision, approval, purchase or completed task.

**Why it matters:** Your effort produces something that can remain useful elsewhere.

[link:return-valve][Return to the return-valve idea]

#### Make Reliance Explicit
slug: explicit-reliance

A service states which outputs, issuers and conditions it accepts.

A receiving tool can check evidence rather than rely on someone copying an assertion into a form.

**Why it matters:** Connections between tools become clearer and more accountable.

- [link:proposal-payment][Example: From Proposal to Payment]

##### Example: From Proposal to Payment
slug: proposal-payment

**Illustrative scenario**

A community uses separate tools for each step:

- A presentation identifies the proposal version.
- Voting records a decision under the group's rules.
- Budgeting issues a limited spending authorisation.
- Execution records approved milestones.
- Payment returns a receipt for reporting.

**Benefit:** Each tool can rely on defined outputs from the others.

#### React to Relevant Events
slug: reactive-workflows

New receipts and status changes can trigger reassessment or an authorised next step.

**Why it matters:** People need not manually carry every update between tools.

- [link:milestone-payment][Example: A Milestone Becomes Payable]

##### Example: A Milestone Becomes Payable
slug: milestone-payment

**Illustrative scenario**

An accepted reviewer confirms a milestone is complete.

A payment service evaluates that evidence alongside the budget and approval requirements.

**Benefit:** Completion can become usable input to payment without treating every completion claim as sufficient.

#### Trace the Basis of a Decision
slug: decision-lineage

Link an action to the proposal, approval or evidence on which it relied.

**Why it matters:** People can inspect why something was authorised and which version was approved.

[link:integrity-foundation][Explore integrity and recorded lineage]

#### What This Depends On
slug: workflow-boundaries

Services need shared meanings and acceptance rules, not just valid signatures.

Event delivery, retries and reconciliation still matter.

Cryptography preserves recorded lineage; it cannot establish an unrecorded history of every copy or transformation.

### Find What Fits Your Life, Privately
slug: private-discovery

Match opportunities to your circumstances and intentions without broadcasting a complete personal profile.

**Why it matters:** Discovery can be shaped by what you need, not only by what a provider knows about you.

**Current concern:** Advertising incentives can encourage extensive personal-data collection.

- [link:offer-requirements][Services Describe Whom They Can Help]
- [link:private-matching][Your Wallet Assesses What Fits]
- [link:chosen-engagement][Choose When to Engage]
- [link:discovery-agent][Let an Agent Follow Your Preferences]
- [link:discovery-boundaries][What This Depends On]

#### Services Describe Whom They Can Help
slug: offer-requirements

Providers publish what they offer, who qualifies and which evidence they accept.

Your wallet can query its held evidence to assess a potential match.

**Why it matters:** A provider need not first acquire a detailed profile to describe a relevant offer.

#### Your Wallet Assesses What Fits
slug: private-matching

Evaluate eligibility alongside preferences and current intentions.

- Do I appear to qualify?
- Does this fit what I want?
- What would I need to disclose?

**Why it matters:** Being eligible is not the same as wanting to be approached.

- [link:already-bought][Example: I Have Already Bought One]
- [link:moved-opportunities][Example: I Have Moved]

##### Example: I Have Already Bought One
slug: already-bought

**Illustrative scenario**

After a washing-machine purchase, your wallet or agent stops surfacing replacement offers while retaining relevant warranty or maintenance opportunities.

**Benefit:** Your current circumstances can improve relevance without being broadcast to every advertiser.

##### Example: I Have Moved
slug: moved-opportunities

**Illustrative scenario**

Your wallet evaluates local offers against your updated circumstances and preferences.

**Benefit:** New opportunities can become relevant without publishing your new address to every provider.

#### Choose When to Engage
slug: chosen-engagement

Discovery, eligibility assessment and identifying yourself need not happen together.

You can ignore an offer, save it, request details or provide the necessary evidence when choosing to proceed.

**Why it matters:** Providers need not receive a list of everyone who privately evaluated an offer.

#### Let an Agent Follow Your Preferences
slug: discovery-agent

An authorised agent can search, shortlist or take permitted actions for you.

**Example instruction:** “Find suitable options, but ask before sharing my details or making a booking.”

**Why it matters:** Useful assistance need not require unlimited disclosure or autonomy.

#### What This Depends On
slug: discovery-boundaries

A wallet's eligibility assessment may still need final acceptance by the provider.

Remote searches, status checks and notifications can reveal interests.

Distribution, fair ranking and commercial incentives require deliberate design. A wallet enables an alternative to profiling-driven discovery; it does not automatically replace advertising.

## The Foundation Behind These Outcomes
slug: wallet-foundation

These capabilities support the outcomes; they are not benefits that every wallet automatically supplies.

KERI provides identity-control and attribution foundations. Credential formats, wallet behaviour, policy services and integrations provide additional capabilities.

**Scope:** What the foundation contributes, not a technical implementation walkthrough.

- [link:identity-foundation][Identity and Key Management]
- [link:integrity-foundation][Integrity and Recorded Lineage]
- [link:disclosure-foundation][Privacy, Disclosure and Encryption]
- [link:policy-foundation][Relationships and Policies]
- [link:lifecycle-foundation][Lifecycle and Status]
- [link:interop-foundation][Interoperability with Existing Services]
- [link:distributed-authority][Distributed Authority]

### Identity and Key Management
slug: identity-foundation

Continuity of identifier control and verifiable attribution as keys change.

**Supports:** reusable evidence, provider independence and distinguishable agents.

**Depends on:** sound custody, recovery and device security.

[Source: KERI specification](https://trustoverip.github.io/kswg-keri-specification/)

### Integrity and Recorded Lineage
slug: integrity-foundation

Check the origin of a statement, protected content and relevant links between assertions.

**Supports:** reusable proofs, connected workflows and inspection of decision histories.

**Boundary:** An authentic statement can be false or outdated. A signature does not by itself guarantee factual truth or legal non-repudiation.

[Source: KERI specification](https://trustoverip.github.io/kswg-keri-specification/)

### Privacy, Disclosure and Encryption
slug: disclosure-foundation

Disclosure controls can limit what is revealed. Encryption can limit who can read protected information.

**Supports:** narrower evidence requests and private matching.

**Boundary:** Selective disclosure is not automatically an arbitrary zero-knowledge proof or a guarantee against correlation.

[Source: ACDC disclosure mechanisms](https://trustoverip.github.io/kswg-acdc-specification/)

### Relationships and Policies
slug: policy-foundation

Express membership, accepted issuers, delegated responsibilities and conditions for action.

**Supports:** groups, care circles, organisations and agent hierarchies.

**Boundary:** Identifier delegation and permission for a particular business action are separate questions.

[link:trust-rules][Explore bring-your-own-trust rules]

### Lifecycle and Status
slug: lifecycle-foundation

Use relevant changes to reassess whether evidence and authority remain acceptable.

**Supports:** current credentials, changing membership and time-limited agent tasks.

**Depends on:** available status information, freshness rules and reliable enforcement.

[link:changing-authority][Explore changing authority]

### Interoperability with Existing Services
slug: interop-foundation

Adapters and shared protocols can let services recognise evidence and authority through familiar interfaces.

**Supports:** incremental adoption and tool choice.

**Boundary:** Applications still need compatible formats, trusted issuers, meaningful claims and enforcement. A JWT alone does not define group permissions.

- [link:credential-standards][Reference: Credential Exchange Standards]
- [link:oauth-integration][Reference: OAuth Integration]

#### Reference: Credential Exchange Standards
slug: credential-standards

**Standards context**

- OpenID4VCI supports credential issuance.
- OpenID4VP supports credential requests and presentations.

Exchange protocols do not alone guarantee compatible formats or trust policies.

[OpenID4VCI final specification announcement](https://openid.net/openid-for-verifiable-credential-issuance-1-final-specification-approved/) · [OpenID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html)

#### Reference: OAuth Integration
slug: oauth-integration

**Standards context · October 2026**

OAuth-based authorisation and OIDC sign-in interfaces can provide an adoption route for existing applications.

OAuth 2.1 remains an Internet-Draft at this date.

**Boundary:** Protocol support is distinct from acceptance of wallet evidence and the permissions derived from it.

[Source: OAuth 2.1 draft status](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)

### Distributed Authority
slug: distributed-authority

Different parties remain authoritative for defined facts and decisions.

A school controls its teaching assertions; a parent controls sharing rules; a service controls what it accepts.

**Why it matters:** Cooperation need not require one global platform or one universal source of truth.

- [link:no-global-chain][No Global Blockchain Required]

#### No Global Blockchain Required
slug: no-global-chain

KERI does not require a global consensus ledger.

It still relies on mechanisms for event verification, availability and detecting conflicting histories.

**Why it matters:** Identity coordination need not mean putting everyone's activity on one global chain.

**Boundary:** Distribution moves and separates responsibilities; it does not remove coordination.

[Source: KERI specification](https://trustoverip.github.io/kswg-keri-specification/)

## How This Answers the Current Situation
slug: impact-map

Wallets provide a foundation for solving these problems when participating services implement the necessary acceptance and enforcement.

**Current-state connection:** repeated work, scattered information, stranded value and fragmented authority.

- [link:map-repetition][Less Repeated Work]
- [link:map-exposure][Less Unnecessary Exposure]
- [link:map-portability][Less Stranded Value and Manual Coordination]
- [link:map-authority][Safer Cooperation as Roles Change]

### Less Repeated Work
slug: map-repetition

**Pain:** Repeated information, repeated proofs and inconsistent records.

**Foundation:** Reusable evidence and status-aware integrations.

**Remaining work:** Acceptance policies, necessary new checks, corrections and synchronisation.

**Current pain:** We keep starting again.
[link:reuse-evidence][Explore the impact]

### Less Unnecessary Exposure
slug: map-exposure

**Pain:** Excessive disclosure, lasting copies and difficult oversight.

**Foundation:** Narrower proofs and controlled access.

**Remaining work:** Recipient retention, security and downstream accountability.

**Current pain:** We leave information everywhere.
[link:minimal-sharing][Explore the impact]

### Less Stranded Value and Manual Coordination
slug: map-portability

**Pain:** Stranded history, disconnected tools and dependence on a shared platform.

**Foundation:** Portable records, verifiable receipts and explicit reliance.

**Remaining work:** Shared meaning, recognition and operational integration.

**Current pain:** What we build does not travel with us.
[link:keep-value][Explore continuity]
[link:receipt-workflows][Explore connected workflows]

### Safer Cooperation as Roles Change
slug: map-authority

**Pain:** Recreated groups, shared credentials, unclear delegation and lingering access.

**Foundation:** Relationships, scoped authority and lifecycle information.

**Remaining work:** Usable controls, policy enforcement and timely revocation.

**Current pain:** We keep rebuilding who can act for whom.
[link:shared-authority][Explore the impact]


