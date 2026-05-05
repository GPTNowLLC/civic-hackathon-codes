# Hackathon Brief — City Code & Regulation Search Assistant

## Problem statement

People who live and work in the city of Portland have questions about what they can do on their property. It is difficult for them to find answers to seemingly simple questions, leading to frustration and confusion. It is not uncommon for people to work on their property without knowing the rules, which can result in code violations at best and safety hazards at worst.

**Challenge question:** How might we help community members easily find and apply relevant rules and regulations to real-world situations, with clear references to authoritative sources?

## Sponsor

Bureau of Planning & Sustainability (BPS), Code Alignment program. Presented at the OSU AI Incubation Lab kickoff: https://events.oregonstate.edu/event/incubation-lab-kick-off

## Key constraint

Authoritative sources must be cited. The challenge explicitly requires "clear attribution to official documents." This distinguishes the codes & regulations challenge from a general Q&A task — a response that gives correct guidance but cites nothing fails the brief.

## Sample questions (from hackathon brief)

The hackathon brief listed 7 sample homeowner questions. This benchmark expanded the corpus to 14 scenarios (see `data/scenarios.json` for the canonical list) to cover more of Portland's code surface — sewer, signage, accessory structures, historic-district edge cases — and to spread across neighborhoods. The original 7 brief seeds:

1. Can I build a tiny house on my lot?
2. How high can my fence be?
3. Can I remove a tree in my front yard?
4. What are the setback requirements for an ADU?
5. Do I need a permit to replace my roof?
6. Can my lot be divided and developed into condos?
7. Can I put an A-board sign outside my business?

## Data sources

The hackathon provides access to the full Portland City Code and supporting administrative documents:

| Title | Subject |
|---|---|
| Title 4 | Original Art Murals |
| Title 10 | Erosion and Sediment Control |
| Title 11 | Trees |
| Title 17 | Public Improvements |
| Title 18 | Noise Control |
| Title 24 | Building Regulations |
| Title 25 | Plumbing Regulations |
| Title 26 | Electrical Regulations |
| Title 27 | Heating and Ventilating Regulations |
| Title 28 | Floating Structures |
| Title 29 | Property Maintenance Regulations |
| Title 31 | Fire Regulations (coordinate with PF&R) |
| Title 32 | Signs and Related Regulations |
| Title 33 | Zoning Code |

Additional sources:
- Transportation Administrative Rules: https://www.portland.gov/transportation/development/commonly-referenced-transportation-code-and-administrative-rules
- Sewer, Stormwater & Erosion Control: https://www.portland.gov/policies/environment-built/sewer-stormwater-erosion-control
- Building Official Determinations
- Administrative Rules and Code Guides
- Program Guides

## Evaluation approach

This ship evaluates general-purpose AI tools (ChatGPT, Claude, Grok, Gemini, Perplexity) against a four-dimension rubric, all 0–3, derived from atomized claims rather than a single end-of-response score:

1. **Accuracy** — are the specific factual claims actually correct?
2. **Completeness** — did the response cover the things a resident needs to act?
3. **Authoritative Citations** — sources from `portland.gov` / Portland Titles, vs. blogs / nothing?
4. **Consumability** — would an average Portland resident or business owner understand and act on this?

The corpus is **14 address-specific scenarios** (see `data/scenarios.json`), expanded from the brief's 7 sample questions. Each scenario is queried with the homeowner's actual address, since the address-specific test is what surfaces whether a tool can reach property-level constraints (zoning overlays, historic-district rules, easements) at all.

## Key hypothesis

Current AI tools can tell people what rules exist (modest Accuracy and Completeness) but cannot reliably cite the authoritative source documents (Authoritative Citations near zero), and they generally can't retrieve property-specific data. The data gap is primarily a structured-access problem: Portland's code is publicly available but not in a form that AI tools can reliably attribute at the section level. The hackathon solution needs to close that gap.

## Stakeholders

- **BPS Code Alignment program** — challenge sponsor
- **Homeowners and small business owners** — primary end users
- **Bureau of Development Services (BDS)** — issues permits, enforces code
- **Portland Bureau of Transportation (PBOT)** — transportation admin rules, ROW
- **Urban Forestry** — Title 11 tree permits
