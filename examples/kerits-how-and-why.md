<!--
Presentation: Identity you control. Trust you can carry.
Prepared: 2026-10-07
Three top-level slides: introduction, benefit classification, next steps.
Each heading defines a slide; its body excludes descendant sections.
slug: is metadata immediately following each heading.
Internal navigation: [link:slug][label]. Every target exists in this file.
Concept explanations live beneath the introduction; examples link back to them.
Examples are illustrative and depend on participating services.
Return-from-link behaviour belongs to the presentation player.
Contact and working-group destinations have not been supplied: calls to action use the supplied kerits.id homepage. Replace with verified direct destinations before publication if desired.
-->

# Identity You Control. Trust You Can Carry.
slug: intro

Create identities, keep control as things change, and build a history others can verify.

Use that history to prove you qualify without sharing the whole story.

**Your wallet brings the pieces together.**

- [link:own-identity][Create an Identity You Control]
- [link:control-over-time][Keep Control as Things Change]
- [link:verifiable-records][Build a History Others Can Verify]
- [link:qualify][Prove You Qualify Without Sharing the Whole Story]
- [link:relationships][Act Together and Delegate]
- [link:confidentiality][Protect Information for Intended Readers]

## Create an Identity You Control
slug: own-identity

You create an identifier whose control can be checked.

Your wallet helps you manage the keys and rules behind it.

**Why it is different:** Recognition need not depend on the service that first created an account for you.

- [link:keys][What Are Keys?]
- [link:identity-wallet][Identity, Wallet and Account]
- [link:context-identities][Different Identities for Different Contexts]

### What Are Keys?
slug: keys

A private key lets you create a digital signature. Its public key lets others check that signature.

Keep the private key secret; share the public key when verification requires it.

**A signature demonstrates key control—not automatically your name or real-world authority.**

- [link:signatures][How Do You Prove Control?]

#### How Do You Prove Control?
slug: signatures

The verifier sends a fresh challenge. Your wallet signs a response bound to that interaction.

The verifier checks the signature against the identity's authorised keys.

**Why it matters:** Copying an identifier or old response is not sufficient to impersonate its controller.

### Identity, Wallet and Account
slug: identity-wallet

- **Identity:** an identifier with verifiable control rules.
- **Wallet:** software for managing identities, records and interactions.
- **Account:** a service's own record of its relationship with you.

One wallet can manage several identities. A service can retain its own account and bookkeeping.

### Different Identities for Different Contexts
slug: context-identities

You can choose separate identities for different relationships.

A bank knows one identity; a club knows another. Each maintains its own context.

**Why it matters:** Using one service need not disclose all your other relationships.

[link:evidence-binding][How can evidence from different identities be combined?]

## Keep Control as Things Change
slug: control-over-time

An identity can continue while its devices, keys or controllers change.

Verifiable rules and history let others check those changes.

**Why it matters:** Replacing a device or changing a team need not mean starting again.

- [link:control-rules][Choose How Control Is Shared]
- [link:keri-history][KERI: A Verifiable Control History]
- [link:recovery][Recovery Is Part of the Design]

### Choose How Control Is Shared
slug: control-rules

Control can require one signature or a defined combination of signatures.

For example, an organisation may require two of three controllers.

**Distinction:** Rules for controlling an identity are separate from rules for approving a business action.

### KERI: A Verifiable Control History
slug: keri-history

KERI records identity-control events in a verifiable history.

Events identify authorised keys and thresholds, and link to previous events. Persistent identifiers can remain stable through authorised key changes.

[Source: KERI specification](https://trustoverip.github.io/kswg-keri-specification/)

- [link:inception][Where Does the Identifier Come From?]
- [link:rotation][Pre-Commitments and Rotation]
- [link:history-checks][Who Checks the History?]

#### Where Does the Identifier Come From?
slug: inception

A common persistent KERI identifier is derived from its inception information, including initial control rules.

It is not simply a username assigned by a website.

**Why it matters:** The identifier is cryptographically bound to its starting configuration.

#### Pre-Commitments and Rotation
slug: rotation

A transferable KERI identity commits to future rotation keys before revealing them.

A valid rotation satisfies the relevant commitments and signature rules, then establishes updated control.

**Why it matters:** Key changes can be verified as part of the continuing identity.

#### Who Checks the History?
slug: history-checks

Validators check events and signatures. Witnesses and watchers can support availability and detection of conflicting histories.

**Boundary:** A locally valid history may still be stale. Current-state assurance needs appropriate supporting information.

A global blockchain is not required.

### Recovery Is Part of the Design
slug: recovery

Plan how control survives a lost device or unavailable controller.

Recovery depends on the keys, backups and control arrangements actually configured.

**Why it matters:** An identifier's persistence does not recover lost secrets by itself.

## Build a History Others Can Verify
slug: verifiable-records

Services and people can issue verifiable records: credentials, receipts, authorisations and statements.

You can retain useful evidence and present it wherever it is accepted.

**Why it matters:** What you do in one service can help you somewhere else.

- [link:record-meaning][What Is in a Record?]
- [link:record-roles][Issuer, Subject and Holder]
- [link:record-integrity][Hashes and Signatures]
- [link:record-status][Is the Record Still Valid?]
- [link:record-storage][Where Are Records Stored?]

### What Is in a Record?
slug: record-meaning

A useful record identifies its issuer, its claim and the relevant subject or item.

It may also specify scope, dates, status and links to other records.

**Examples:** a qualification, purchase receipt, spending authorisation or repair report.

### Issuer, Subject and Holder
slug: record-roles

- **Issuer:** makes the statement.
- **Subject:** whom or what it concerns.
- **Holder:** possesses and presents the record.

A parent may hold a child's credential. A repair record may concern an appliance.

These roles need not be the same identity.

### Hashes and Signatures
slug: record-integrity

A hash identifies particular content. A signature connects approval of that content to an authorised signing key.

**Why it matters:** Recipients can detect changes and verify origin.

**Boundary:** Authentic origin does not establish that a claim is true.

- [link:hashes][What Is a Hash?]

#### What Is a Hash?
slug: hashes

A cryptographic hash is a compact fingerprint calculated from data.

Changing the data changes the fingerprint with overwhelming probability.

A hash alone neither identifies the author nor hides predictable content. Structured data needs a consistent encoding to produce a reproducible fingerprint.

### Is the Record Still Valid?
slug: record-status

A record may expire, be revoked or be superseded.

A verifier checks the status and freshness required by the decision.

**Why it matters:** A valid signature on an old record does not establish a current entitlement.

### Where Are Records Stored?
slug: record-storage

Records may be held on a device, backed up or hosted.

Their authenticity need not depend on trusting the storage provider.

Verification requires sufficient supporting evidence; current status may require recent information.

**Private records do not need to be published with public verification material.**

## Prove You Qualify Without Sharing the Whole Story
slug: qualify

A service describes its requirements. Your wallet finds relevant evidence and assembles an answer.

The service checks it directly or accepts a conclusion from a verifier it trusts.

**Why it matters:** A narrow decision can use less information.

- [link:policy][Policies Express the Requirements]
- [link:assemble][Your Wallet Assembles Evidence]
- [link:evidence-binding][Binding Evidence to the Presenter]
- [link:disclosure][Choose What Is Disclosed]
- [link:verification][Accept a Trusted Verification Result]

### Policies Express the Requirements
slug: policy

A policy describes acceptable evidence, issuers, relationships and conditions.

Anyone can write a policy. It governs access when the responsible service or resource owner adopts it.

**Example:** local resident AND aged 18 or over, supported by accepted issuers.

### Your Wallet Assembles Evidence
slug: assemble

Your wallet looks for relevant records across the identities you manage.

It can identify missing evidence and let you choose what to present.

**Why it matters:** Services can state what they need without collecting your entire history.

### Binding Evidence to the Presenter
slug: evidence-binding

The proof must establish why the evidence supports the identity presented in this interaction.

Control of several identities alone does not establish “same human”, ownership of group assets or permission to transfer an entitlement.

**The policy defines the relationship that must be demonstrated.**

### Choose What Is Disclosed
slug: disclosure

Where supported, present selected claims rather than a complete record.

Alternatively, an accepted verifier can check underlying evidence and attest to the relevant conclusion.

**Boundary:** A verifier may see information the final service does not.

- [link:age-mechanism][An Age Claim Is Not a Hidden-Date Calculation]
- [link:correlation][Different IDs Are Not Guaranteed Anonymity]

#### An Age Claim Is Not a Hidden-Date Calculation
slug: age-mechanism

Presenting an issued “over 18” claim differs from deriving a threshold proof from a hidden birth date.

The latter requires a suitable proof mechanism.

**The promise:** Minimal disclosure supported by the actual credential and proof design.

[Source: ACDC disclosure mechanisms](https://trustoverip.github.io/kswg-acdc-specification/)

#### Different IDs Are Not Guaranteed Anonymity
slug: correlation

Separate identifiers can reduce direct linking between contexts.

Disclosed attributes, intermediaries, network metadata and repeated presentations can still connect them.

**Ask:** Private from whom, and which information remains visible?

### Accept a Trusted Verification Result
slug: verification

A service may accept a verifier's signed conclusion about a chosen identity.

The result identifies the exact policy, subject, intended recipient and relevant validity limits.

**Why it matters:** The service can receive the decision evidence without receiving every underlying record.

- [link:result-binding][A Result Is Bound to This Interaction]
- [link:verifier-state][Does the Verifier Need an Account for You?]

#### A Result Is Bound to This Interaction
slug: result-binding

Check the expected policy version, approved verifier, subject control, audience, freshness and challenge.

A hash detects a changed policy; it does not make an unapproved policy acceptable.

**Why it matters:** A copied result or easier substituted rule must not grant access.

[Source: OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)

#### Does the Verifier Need an Account for You?
slug: verifier-state

Not necessarily. It can evaluate evidence without maintaining a lasting personal profile.

It still needs trusted configuration and suitable status and replay controls.

**Privacy depends on actual processing and retention—not on calling the verifier stateless.**

## Act Together and Delegate
slug: relationships

Groups, roles and delegated authority can be expressed as evidence that participating services recognise.

People and agents can act in a particular capacity without sharing one account.

- [link:distributed-trust][Trust Different Parties for Different Things]
- [link:role-policy][Membership, Roles and Governance]
- [link:delegate-scope][Give a Delegate Limited Authority]
- [link:lifecycle][Let Services Follow Changes]

### Trust Different Parties for Different Things
slug: distributed-trust

A school confirms enrolment. A parent sets sharing rules. A service decides what evidence it accepts.

No single organisation has to issue every identity, hold every record or approve every interaction.

**Trust is specific:** accepting a school's enrolment claim does not let it approve payments.

### Membership, Roles and Governance
slug: role-policy

Membership says who belongs. A role describes a capacity. A policy determines what that capacity permits.

A club can appoint a treasurer while requiring two approvals for large purchases.

**Identity control, organisational membership and spending authority are distinct.**

### Give a Delegate Limited Authority
slug: delegate-scope

Identify the delegate and define its permitted actions, resources, duration and further-delegation rights.

A KERI delegated identifier can establish an identity relationship; business permissions still need their own rules.

**Why it matters:** Acting for someone need not mean impersonating them.

### Let Services Follow Changes
slug: lifecycle

Services can reassess access when membership, roles, credentials or assignments change.

Tokens and sessions need appropriate expiry, freshness checks or revocation.

**Why it matters:** A relationship change should lead to a defined access change—not an unbounded stale permission.

## Protect Information for Intended Readers
slug: confidentiality

Verifiable records can also be confidential.

An authorised reader can check a record's origin and integrity without making its content available to everyone.

- [link:encryption][Encrypt Across Provider Boundaries]
- [link:confidential-record][Records About Someone Are Not Always Held by Them]

### Encrypt Across Provider Boundaries
slug: encryption

Use an authenticated encryption key associated with the intended recipient's identity.

Compatible services can exchange encrypted information without sharing one provider.

Signing keys and encryption or key-agreement keys have different roles.

[Source: RFC 8037](https://www.rfc-editor.org/rfc/rfc8037.html)

### Records About Someone Are Not Always Held by Them
slug: confidential-record

An organisation could protect a safeguarding concern for authorised reviewers.

They can verify who recorded it and whether it changed. The subject need not hold the record or control its inclusion.

**Boundary:** Access rights, correction and lawful withholding remain governance questions.

- [link:confidential-limits][Confidential Is Not Necessarily Anonymous]

#### Confidential Is Not Necessarily Anonymous
slug: confidential-limits

Encryption can protect content while metadata still reveals a record's existence or relationships.

A verified concern remains an assertion, not an established fact.

Anonymous to the subject, anonymous to reviewers and untraceable to everyone are different promises.

# Where It Matters
slug: benefits

The same building blocks support different benefits.

Choose a story that matters to you; follow its “how” links whenever you want more detail.

- [link:benefit-discovery][Private Discovery and Eligibility]
- [link:benefit-history][Portable History]
- [link:benefit-introductions][Consented Introductions]
- [link:benefit-governance][Shared Decisions and Changing Roles]
- [link:benefit-delegation][Delegated Coordination]

## Private Discovery and Eligibility
slug: benefit-discovery

“Tell me what fits before I reveal my circumstances.”

Combine evidence to assess eligibility and relevance, then choose whether to engage.

- [link:pub][Local and Old Enough]
- [link:skills-match][Skills, Opportunity and the Missing Qualification]

### Local and Old Enough
slug: pub

A pub offers a discount to local adults.

Alice combines residency and age evidence from two accepted issuers. The pub receives evidence that she qualifies without her full address or birth date.

**Revelation:** Evidence from independent sources becomes useful together.

- [link:pub-rule][The Pub States Its Rule]
- [link:pub-records][Alice Brings Two Records]
- [link:pub-answer][The Wallet Combines Them]
- [link:pub-result][The Pub Learns She Qualifies]
- [link:pub-receipt][The Interaction Returns a Receipt]

#### The Pub States Its Rule
slug: pub-rule

“Local resident AND aged 18 or over, using evidence from these issuers.”

The pub chooses the accepted rule and verification route.

[link:policy][How do policies work?]

#### Alice Brings Two Records
slug: pub-records

Alice has residency evidence from one accepted organisation and age evidence from another.

Neither issuer needed to anticipate this particular discount.

[link:verifiable-records][What makes these records reusable?]

#### The Wallet Combines Them
slug: pub-answer

Alice chooses an identity for this interaction. Her wallet assembles evidence bound to that presenter.

[link:assemble][How does the wallet find evidence?]
[link:evidence-binding][How are the identities connected?]

#### The Pub Learns She Qualifies
slug: pub-result

The pub checks accepted evidence or a trusted verifier's result.

It need not receive Alice's name, full address or birth date for this eligibility decision.

[link:disclosure][How can she reveal less?]
[link:correlation][What privacy does this provide?]

#### The Interaction Returns a Receipt
slug: pub-receipt

The pub can return a purchase or membership record for Alice's chosen identity.

It maintains its own records; Alice retains something useful too.

[link:record-meaning][What can another service recognise?]

### Skills, Opportunity and the Missing Qualification
slug: skills-match

A wallet combines qualifications and experience to find a suitable opportunity—and identifies the requirement still missing.

**Revelation:** Evidence can support useful advice, not just a yes/no gate.

- [link:skills-rule][The Opportunity Describes Its Requirements]
- [link:skills-gap][The Wallet Identifies the Gap]
- [link:skills-apply][The Person Chooses Whether to Apply]

#### The Opportunity Describes Its Requirements
slug: skills-rule

A role requires accepted qualifications and relevant experience.

The wallet compares those requirements with selected records.

[link:policy][How are requirements expressed?]
[link:assemble][How is evidence assembled?]

#### The Wallet Identifies the Gap
slug: skills-gap

The wallet finds that one required certification is missing or expired.

It can show the gap before the person sends an application.

**Condition:** The requirements must be sufficiently clear and machine-readable.

[link:record-status][How is current validity checked?]

#### The Person Chooses Whether to Apply
slug: skills-apply

Eligibility is separate from preference. The person may qualify but dislike the location, salary or commitment.

They choose when to disclose relevant evidence.

[link:disclosure][How is disclosure limited?]

## Portable History
slug: benefit-history

“Let the value of what I have already done help me somewhere else.”

Useful records can accumulate across independent services.

- [link:repair-resale][Purchase, Repair and Resale]
- [link:work-history][Training and Experience Travel Together]

### Purchase, Repair and Resale
slug: repair-resale

A purchase receipt supports a repair. The repairer adds a service record. A later buyer inspects selected evidence.

**Revelation:** The item's useful history grows across different providers.

- [link:purchase-record][The Purchase Produces a Record]
- [link:repair-record][A Repairer Adds Evidence]
- [link:resale-record][The Next Buyer Sees Relevant History]

#### The Purchase Produces a Record
slug: purchase-record

A retailer issues a receipt describing the purchase and relevant item.

The buyer retains it beyond the retailer's account interface.

[link:record-meaning][What does the receipt identify?]
[link:record-storage][Where is it kept?]

#### A Repairer Adds Evidence
slug: repair-record

An independent repairer accepts relevant purchase evidence and issues a record of its own work.

Records refer to the same item through an accepted identifier or binding.

[link:record-integrity][How are origin and links checked?]

#### The Next Buyer Sees Relevant History
slug: resale-record

The seller presents selected purchase and repair evidence without necessarily exposing unrelated personal details.

**Boundary:** A receipt alone may not prove current ownership. Resale requires suitable ownership and transfer checks.

[link:disclosure][How can records be selectively shared?]

### Training and Experience Travel Together
slug: work-history

A person combines training credentials and accepted evidence of completed work for a new employer.

Each source remains responsible for its own claims.

**Benefit:** A change of platform need not discard accumulated evidence.

[link:distributed-trust][Whose claims should be accepted?]
[link:record-status][Are they still relevant and valid?]

## Consented Introductions
slug: benefit-introductions

“Help us connect without collecting everyone's relationships.”

Participants choose what to share and when an introduction may happen.

- [link:shared-activity][Friends, an Activity and an Optional Introduction]
- [link:trusted-introduction][A Trusted Recommendation]

### Friends, an Activity and an Optional Introduction
slug: shared-activity

Friends choose to share activity interests. A wallet or authorised matcher finds a possible outing.

Participants choose whether to accept an introduction.

**Revelation:** Useful social coordination need not begin with uploading an entire address book.

- [link:activity-interest][Share an Interest with a Chosen Audience]
- [link:activity-match][Find a Possible Match]
- [link:activity-intro][Ask Before Making the Introduction]

#### Share an Interest with a Chosen Audience
slug: activity-interest

Someone shares “interested in weekend walks” with selected contacts or an authorised matching service.

**Choice:** who receives it, for what purpose and for how long.

[link:confidentiality][How can access be restricted?]

#### Find a Possible Match
slug: activity-match

A wallet or authorised matcher compares the shared interests.

**Boundary:** The place doing the matching processes some information. The design must identify who can see it.

[link:correlation][What can still become visible?]

#### Ask Before Making the Introduction
slug: activity-intro

Participants decide whether to reveal contact details or accept the introduction.

The activity provider receives what it needs when they choose to proceed.

[link:disclosure][How is each disclosure limited?]

### A Trusted Recommendation
slug: trusted-introduction

A friend shares a provider's relevant recommendation record with you.

You can inspect its origin and decide whether to request an introduction.

**Benefit:** A useful connection can travel without exposing everyone's relationships.

[link:record-integrity][Who made the recommendation?]
[link:distributed-trust][Why would I accept it?]

## Shared Decisions and Changing Roles
slug: benefit-governance

“Let our services follow our agreements.”

Decisions and relationships become usable inputs to participating services.

- [link:vote-budget][Qualify, Vote and Approve a Budget]
- [link:treasurer-story][A Treasurer Handover]
- [link:carer-story][A Changing Care Circle]

### Qualify, Vote and Approve a Budget
slug: vote-budget

A community establishes eligibility, votes on an identified proposal and uses the accepted result to authorise a budget.

**Revelation:** Independent tools can support one coherent decision process.

- [link:vote-qualify][Qualify to Participate]
- [link:vote-decision][Approve an Identified Proposal]
- [link:vote-spend][Translate Approval into Spending Authority]

#### Qualify to Participate
slug: vote-qualify

The voting service checks the community's eligibility rule.

Uniqueness and duplicate-vote prevention require additional election-specific controls.

[link:qualify][How is eligibility demonstrated?]

#### Approve an Identified Proposal
slug: vote-decision

The accepted voting process issues a result tied to a particular proposal version.

One person's participation receipt is not itself proof that the proposal passed.

[link:hashes][How is the proposal version identified?]
[link:distributed-trust][Who may certify the result?]

#### Translate Approval into Spending Authority
slug: vote-spend

A budgeting tool accepts the result and issues authority with defined limits.

A purchasing service checks that authority and tracks remaining budget.

[link:policy][How are limits expressed?]
[link:faq-state][Who prevents duplicate spending?]

### A Treasurer Handover
slug: treasurer-story

Alice acts as the club's treasurer using her own identity.

When the club appoints a replacement, participating services reassess permissions.

**Revelation:** Alice, the club and her role remain distinct.

- [link:treasurer-appoint][Appoint the Role]
- [link:treasurer-change][Change the Person, Keep the Organisation]

#### Appoint the Role
slug: treasurer-appoint

The club issues evidence that Alice is its current treasurer.

Services decide which actions that role permits.

[link:role-policy][How do roles differ from permissions?]

#### Change the Person, Keep the Organisation
slug: treasurer-change

The club updates role evidence. The replacement gains appropriate access; Alice's old authority is withdrawn according to the services' enforcement rules.

[link:lifecycle][How do services react to changes?]

### A Changing Care Circle
slug: carer-story

A family authorises selected carers to arrange appointments.

A replacement carer receives appropriate authority without inheriting the previous carer's login.

**Benefit:** Responsibilities can change while identities remain distinguishable.

[link:role-policy][How is the relationship expressed?]
[link:lifecycle][How does old access end?]

## Delegated Coordination
slug: benefit-delegation

“Let someone organise this within boundaries I choose.”

An assistant can have its own identity and a limited assignment.

- [link:repair-agent][An Agent Arranges a Repair]
- [link:appointment-agent][An Assistant Books an Appointment]
- [link:subagent-story][An Assistant Delegates a Search]

### An Agent Arranges a Repair
slug: repair-agent

Alice authorises an agent to arrange a repair up to an agreed cost before Friday.

It can perform that task without receiving her entire account.

**Revelation:** Helpful automation can have explicit boundaries.

- [link:agent-assignment][Define the Assignment]
- [link:agent-enforce][Check Each Relevant Action]
- [link:agent-end][End the Assignment]

#### Define the Assignment
slug: agent-assignment

Specify the agent, permitted task, spending limit, deadline and whether further delegation is allowed.

[link:delegate-scope][How is authority scoped?]

#### Check Each Relevant Action
slug: agent-enforce

The provider checks the agent's identity and accepted authority before permitting an action.

Spending and booking systems still enforce their operational limits.

[link:signatures][How does the agent prove control?]
[link:policy][Who enforces the rule?]

#### End the Assignment
slug: agent-end

The authority expires, completes or is withdrawn.

Services enforce the end of authority, including relevant sessions and downstream permissions.

[link:lifecycle][What happens to existing access?]

### An Assistant Books an Appointment
slug: appointment-agent

An assistant can see available slots and use the details needed to book.

Unrelated messages and records remain outside its assignment.

**Benefit:** A narrow task can have narrow access.

[link:delegate-scope][How are task boundaries defined?]
[link:encryption][How can information be restricted to intended readers?]

### An Assistant Delegates a Search
slug: subagent-story

A travel assistant may delegate accommodation search while retaining booking authority itself.

The sub-agent does not automatically inherit payment powers.

**Benefit:** Delegation can preserve distinctions between tasks, identities and authority.

[link:delegate-scope][Who may delegate further?]

# What's Next?
slug: next

Start with one useful interaction. Build from there.

- [link:start-wallet][Create your first digital wallet.]
- [link:start-provider][Connect your service to kerits.id.]
- [link:start-question][Bring a “How can I…?” question or join a working group.]
- [link:faq][Explore questions we have not covered.]

[Visit kerits.id](https://kerits.id)

## Create Your First Wallet
slug: start-wallet

Create a wallet and an identity. Explore one useful record or relationship.

**A first goal:** identify one thing you repeatedly prove, share or manage across services.

[Get started at kerits.id](https://kerits.id)

[link:identity-wallet][What am I creating?]

## Connect Your Service
slug: start-provider

Create an identity for your service and choose one small integration.

- What evidence would you accept?
- What useful receipt could you return?
- What rule should control an action?

**Get in touch for integration help through kerits.id.**

[Visit kerits.id](https://kerits.id)

- [link:provider-request][Start with One Evidence Request]
- [link:provider-receipt][Return One Useful Record]

### Start with One Evidence Request
slug: provider-request

Choose a decision your service already makes: membership, eligibility or delegated access.

Define accepted issuers, required evidence and freshness.

**Aim:** a small, testable integration with a clear user benefit.

[link:policy][Explore requirements]
[link:verification][Explore verification]

### Return One Useful Record
slug: provider-receipt

Choose an outcome worth carrying forward: onboarding, approval, purchase or completed work.

Define what it means and which identity or item it concerns.

**Aim:** let another service use the result without rebuilding the original interaction.

[link:verifiable-records][Explore verifiable records]

## Bring a Question or a Working Group
slug: start-question

Start with “How can I…?”

- Prove eligibility with less disclosure?
- Connect two services around a useful receipt?
- Manage a group or care circle across services?
- Give an agent limited authority?

**Bring the desired outcome, existing tools and the people who need to trust the result.**

[Visit kerits.id to start the conversation](https://kerits.id)

## Frequently Asked Questions
slug: faq

Choose a question for a short answer. Follow the linked concepts for more depth.

- [link:faq-account][Is This Another Account?]
- [link:faq-central][Is There One Central Authority?]
- [link:faq-migration][Can I Change Wallet Providers?]
- [link:faq-anonymous][Does This Make Me Anonymous?]
- [link:faq-truth][Does a Signature Mean Something Is True?]
- [link:faq-state][Who Prevents Double Spending or Duplicate Actions?]
- [link:faq-revoke][Can Access Be Withdrawn Instantly?]
- [link:faq-integration][Can Any Existing Service Use This?]
- [link:faq-availability][Are These Examples Already Available?]

### Is This Another Account?
slug: faq-account

A service may still maintain an account for its own operations.

The difference is that your identity control and reusable evidence need not originate in that account database.

[link:identity-wallet][Identity, wallet and account]

### Is There One Central Authority?
slug: faq-central

No single authority is required to control every identity or assertion.

Each decision still relies on particular issuers, verifiers and service operators.

**Decentralisation separates trust responsibilities; it does not remove them.**

[link:distributed-trust][Explore distributed trust]

### Can I Change Wallet Providers?
slug: faq-migration

That requires practical support for identity continuity, usable export, recovery and compatible implementations.

Controlling keys alone does not guarantee every record or integration will migrate.

Ask for a demonstrated migration path.

[link:control-over-time][Explore continuing control]

### Does This Make Me Anonymous?
slug: faq-anonymous

It can reduce what particular recipients learn.

Separate identities, selective disclosure and encryption provide different protections. Intermediaries and metadata can still reveal connections.

[link:correlation][Explore privacy boundaries]

### Does a Signature Mean Something Is True?
slug: faq-truth

A valid signature supports attribution and integrity.

You still assess the issuer's authority, the claim's meaning and its relevant status.

[link:record-integrity][Explore signatures and hashes]
[link:record-status][Explore current validity]

### Who Prevents Double Spending or Duplicate Actions?
slug: faq-state

Operational services maintain balances, reservations and transaction state.

A credential can authorise an action without tracking whether a budget has already been spent.

**Policies and proofs complement transactional controls.**

### Can Access Be Withdrawn Instantly?
slug: faq-revoke

Only to the extent participating services enforce suitably fresh status and revocation.

Existing tokens, sessions and offline decisions have defined limits.

[link:lifecycle][Explore lifecycle enforcement]

### Can Any Existing Service Use This?
slug: faq-integration

It needs an integration or compatible interface, accepted evidence and appropriate enforcement.

Adapters can reduce the work; they cannot make an unwilling or incompatible service participate.

[link:start-provider][Start with a small integration]

### Are These Examples Already Available?
slug: faq-availability

These stories describe capabilities and integration patterns, not a claim that every named workflow is already deployed.

Confirm the current wallet features, participating services and implementation requirements for your use case.

[link:start-question][Bring a concrete use case]


