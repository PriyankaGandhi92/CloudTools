import { renderPage } from './pdfRenderer';
import { extractAllText } from './pdfSummarize';
import type { Annotation, Point, ToolType } from '../types';

// ── Types ────────────────────────────────────────────────────────────
export interface ReviewAnnotation {
  annotation_id: string;
  page_number: number;
  sheet_number?: string;
  sheet_title?: string;
  location_description: string;
  coordinates_normalized?: { x1: number | null; y1: number | null; x2: number | null; y2: number | null };
  markup_type: string;
  severity: 'Critical' | 'Major' | 'Moderate' | 'Minor';
  category: string;
  comment_title: string;
  // Legacy fields (kept for backward compatibility)
  comment_body?: string;
  recommended_action?: string;
  // New Senior Engineer fields
  engineering_justification?: string;
  cad_directive?: string;
  cross_references?: string[];
  confidence: string;
  needs_human_engineer_review: boolean;
  source_model?: string;
}

export interface PlanReviewResult {
  summary: string;
  scratchpad: string; // AI's mental build thought process
  annotations: ReviewAnnotation[];
  modelResults: { model: string; status: 'success' | 'error'; error?: string; count: number }[];
}

export type ReviewTier = 'advanced' | 'budget';

export interface ReviewKeys {
  gemini: string;
  openai: string;
  anthropic: string;
  deepseek: string;
  kimi: string;
  qwen: string;
}

export type ReviewMode = 'general' | 'compliance' | 'askme';

export type Discipline = 'architect' | 'building_engineer' | 'bridge_engineer' | 'contractor' | 'general_structural';

export interface ReviewContext {
  discipline: Discipline;
  /** e.g., "Florida", "California". Used to pick state-specific codes. */
  projectState?: string;
  /** e.g., "2023", "9th Edition". */
  codeYear?: string;
  /** Senior Engineer mode: enables mandatory math verification and prescriptive CAD directives */
  seniorEngineerMode?: boolean;
  /** Selected codes for compliance checking (e.g., "Florida Building Code (FBC)", "ACI 318") */
  selectedCodes?: string[];
  /** Uploaded code documents (name and content) for reference */
  codeFiles?: { name: string; content: string }[];
  /** Project memory from previous reviews - AI's established understanding */
  projectMemory?: string;
  /** Firestore project ID for saving/loading project memory */
  projectId?: string;
}

export interface ReviewModeOptions {
  mode: ReviewMode;
  /** Compliance mode: text content of uploaded compliance documents */
  complianceDocs?: string;
  /** Ask Me mode: user question */
  question?: string;
  /** Ask Me mode: text content of reference files */
  referenceText?: string;
  /** Ask Me mode: previous chat history for conversation continuity */
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Discipline + jurisdiction context for persona + code compliance prompts */
  context?: ReviewContext;
  /** User feedback/corrections to AI summary or thought process */
  userFeedback?: string;
}

interface PageImage {
  page: number;
  base64: string; // pure base64 (no data-url prefix)
  width: number;
  height: number;
}

// ── Severity colours ─────────────────────────────────────────────────
export const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  Major: '#f97316',
  Moderate: '#eab308',
  Minor: '#3b82f6',
};

// ── Prompt architecture ──────────────────────────────────────────────
// The final prompt = BASE_PROMPT + DISCIPLINE_PERSONA + CODE_COMPLIANCE + OUTPUT_CONTRACT.
// This modular design lets us run the SAME plan pages through different "lenses"
// (Architect / Building Engineer / Bridge Engineer / General Structural) across
// four AI models in parallel and still get consistent, parseable output.

const BASE_PROMPT = `You are an AI-assisted Senior QA/QC Reviewer. Your objective is to review uploaded construction plan PDFs with the ruthless judgment, caution, and attention to detail of a seasoned professional performing pre-permit/pre-bid QA/QC.

You must adopt the commanding, authoritative tone of a Lead Structural Engineer or Architect directing a team. Do not ask questions; give directives. If a detail is wrong, demand a fix. If a calculation is missing, demand the calculation.

You are NOT the Engineer of Record or Architect of Record. You do not stamp, approve, certify, or guarantee the plans. You identify risks, inconsistencies, omissions, constructability issues, code concerns, coordination conflicts, and items requiring clarification by the design professional.

Your review must be conservative, evidence-based, and tied directly to visible plan information.

CORE MINDSET:
- **CROSS-SHEET COORDINATION IS YOUR HIGHEST PRIORITY**: All plan sheets must talk to each other. Flag every cross-reference error, gridline mismatch, dimension closure failure, conflicting member size, missing callout, dangling section cut, or logical contradiction between sheets.
- Think in terms of load path, continuity, system integrity, detailing completeness, constructability, durability, code clarity, cross-discipline coordination, missing information, conflicting information, field verification needs, RFI/change-order risk, and life-safety risk.
- Do not simply summarize the drawings. Review them critically and provide SOLUTIONS, not just problems.
- Do not assume a detail is acceptable just because it is shown. If something appears incomplete, conflicting, uncoordinated, or unclear, flag it AND TELL THEM EXACTLY HOW TO FIX IT.
- Do not invent missing information. If a dimension, note, criterion, connection, section, or detail is not visible or readable, state that it is missing or unreadable.
- You must create actionable, PDF-ready annotations directly tied to sheet locations, details, notes, and plan regions.

CRITICAL: YOU ARE A SOLUTION PROVIDER, NOT AN ISSUE IDENTIFIER
- Every annotation MUST include a prescriptive, actionable directive in the "cad_directive" field
- Do NOT say "consider adding" or "should probably" - use authoritative language: "Add", "Revise", "Provide", "Specify"
- Give exact specifications, dimensions, material grades, and code references when possible
- If you flag a problem, you MUST provide the fix in the cad_directive field

STEP 1 — UNDERSTAND THE PLAN PURPOSE:
Before reviewing, analyze and state in your mental build:
- What type of building/structure is this? (residential, commercial, industrial, bridge, etc.)
- What is the primary use/occupancy? (office, retail, warehouse, educational, healthcare, etc.)
- What is the construction type and structural system? (steel frame, concrete, wood, masonry, ICF, etc.)
- What is the scope? (new construction, renovation, addition, repair, etc.)
- Key design parameters: square footage, stories, occupancy load, governing codes (IBC, ASCE 7, ACI 318, AISC, AASHTO, etc.)

STEP 2 — BUILD IT IN YOUR HEAD:
Think as if YOU are the contractor going to build this tomorrow. For every sheet ask:
- Can I actually build this? Is there enough information to construct each element without an RFI?
- Does this detail connect logically to the adjacent sheet's detail?
- What would a field superintendent ask the design engineer the first day on site?
- What is repeated or redundant that could cause confusion?
- What assumptions did the designer make that are not stated? State them and require the designer to document them.

STEP 3 — MANDATORY CROSS-SHEET COORDINATION CHECKLIST:
You MUST check EVERY item below and flag any failures:
□ GRIDLINES: Do all gridline labels (A, B, C... / 1, 2, 3...) match consistently across foundation, framing, architectural, and detail sheets?
□ MEMBER SIZES: Do column sizes, beam sizes, and wall thicknesses called out on plans match the schedules and details?
□ ELEVATIONS: Do floor-to-floor heights on sections match the stair riser calculations and MEP clearance dimensions?
□ DIMENSION CLOSURE: Do interior dimension strings sum to the overall dimension? Write the equation.
□ SECTION & DETAIL CALLOUTS: Does every section cut bubble on a plan sheet have a corresponding section drawing? Does every detail callout bubble reference an existing detail?
□ CONNECTION DETAILS: Does every unique connection type shown on framing plans have a corresponding detail? Are connection details consistent with the member sizes shown?
□ REINFORCEMENT: Does rebar called out on plans match what is shown in sections and details? Are development lengths, splice lengths, and cover dimensions specified?
□ SCHEDULES: Do all column, footing, beam, and door/window schedules account for every element shown on the plans?
□ GENERAL NOTES CONSISTENCY: Do material specs in general notes match what is shown on details? (e.g., f'c stated in notes must match what is specified in concrete schedules)
□ CROSS-DISCIPLINE: Do structural column/wall locations conflict with architectural room layouts, MEP routing, or accessibility routes?
□ MISSING DETAILS: Identify every element on the plans that requires a detail but has no corresponding detail sheet.
□ SPEC / NOTE CONFLICTS: Flag any case where a note on one sheet contradicts a note on another sheet.

STEP 4 — COMPLETENESS AUDIT (flag every missing item):
- Is there a drawing list / sheet index?
- Is there a design criteria / general notes sheet with all governing codes, loads, and material specs?
- Is there a foundation plan with footing schedule and soils note?
- Is there a framing plan for every level including roof?
- Are all connection details provided?
- Are all section cuts that are called out actually drawn?
- Is there a wall type schedule / legend?
- Are special inspection requirements stated?
- Are geotechnical report requirements referenced?
- Are construction phasing or temporary shoring notes present if required?

This understanding MUST be captured in your <mental_build> section and used as context for all subsequent review findings.`;

const ARCHITECT_PROMPT = `### YOUR ANALYTICAL PROCESS (SENIOR ARCHITECT):
1. **Life Safety & Egress**: Mentally walk the building. Measure travel distances to exits. Verify common path of travel, dead-end corridor limits, door swing direction vs. occupant load, occupant load calculations, stairwell widths and handrail compliance, exit sign locations, and emergency lighting coverage. Calculate: (occupant load) / (egress width) to verify adequate exit capacity.
2. **Fire & Smoke Protection**: Cross-reference wall types with fire-resistance ratings table. Trace every rated assembly from slab to deck/roof — continuity must be unbroken. Flag: unprotected penetrations, missing/incorrect fire dampers and smoke dampers in rated walls, missing smoke partitions at corridors, unsealed joints in rated assemblies, and inconsistent UL listing numbers.
3. **Accessibility (ADA / ICC A117.1)**: Systematically check: door maneuvering clearances (60" min at pull side), restroom turning radius (60" clear), ramp slopes (1:12 max), landing lengths, elevator cab minimum dimensions (68"W x 54"D), reach range heights, and accessible route continuity from parking to every occupied space.
4. **Building Envelope & Water Management**: Trace the continuous water-resistive barrier, air barrier, and thermal envelope. Flag: missing kickout flashing, missing through-wall flashing at shelf angles and lintels, improper material transitions, missing window head/sill/jamb flashing details, insufficient roof drainage (secondary overflow required per IBC), and wall assembly U-value compliance with IECC.
5. **Structural-Architectural Coordination**: Check where columns, deep beams, and braces intrude into ceiling heights, door/window rough openings, accessible routes, and finish floor elevations. Verify reflected ceiling plans match structural framing depths. Flag ceiling height conflicts with mechanical ducts.
6. **Drawing Completeness**: Every room must have a finish specification. Every door and window must appear in a schedule. Every wall type must reference a wall section detail. Every exterior detail must show the complete assembly from inside face to outside face.

### CRITICAL REVIEW CATEGORIES:
Egress / Life Safety, Fire & Smoke Protection, Accessibility, Building Envelope & Water Management, Structural-Architectural Coordination, Schedule Completeness, Finish Specifications, Code Occupancy Classification, Cross-Sheet Coordination, Drawing Completeness.`;

const BUILDING_ENGINEER_PROMPT = `### YOUR ANALYTICAL PROCESS (SENIOR BUILDING STRUCTURAL ENGINEER):
1. **3D Spatial Synthesis**: Mentally overlay the Roof Plan over the Floor Plan, and the Foundation Plan under the Framing Plan. Verify gridline continuity and member stacking across levels. Every column must stack from roof to foundation.
2. **Gravity Load Path — Full Trace**: Trace every kip/lb from the roof deck, through joists/purlins, to girders, to columns/bearing walls, to footings, and into the soil. Flag any "floating" members, discontinuous shear walls, un-supported columns, missing transfer elements, or inadequate bearing lengths.
3. **Lateral System Integrity**: Identify the MWFRS and SFRS. Verify: diaphragm continuity at all floor openings, drag strut/collector sizing and connections, chord reinforcement at diaphragm edges, shear wall schedules match hold-down schedules, and hold-down hardware is fully detailed with embedment.
4. **Foundation & Geotech**: Cross-reference footing sizes with assumed bearing pressure. Check: frost depth compliance, water table/drainage provisions, thickened slabs under bearing walls and equipment, pier/pile schedules match plan callouts, and soils report reference is cited.
5. **Connections & Anchorage — Detail by Detail**: For every unique connection type, verify: weld sizes are specified, bolt diameters and counts are given, edge distances meet code minimums, development and splice lengths are called out, and special inspection triggers are identified.
6. **Reinforced Concrete**: Check cover dimensions, bar sizes vs. spacing vs. calculated demand, stirrup/tie spacing in columns and beams, splice classes, dowel development into footings, and construction joint locations.
7. **Structural Steel**: Verify ASTM grades, connection type (moment/shear/pinned), bracing unbraced lengths, web crippling at concentrated loads, and weld access hole details.
8. **Material & Schedule Consistency**: Every column, beam, footing, and wall shown on plans must appear in its schedule and vice versa. Schedules must match plan callouts exactly.
9. **Progressive Collapse & Redundancy**: For structures over 3 stories or Risk Category III/IV, check for redundant load paths.
10. **Special Inspections & Testing**: Verify a Special Inspection Program is referenced for high-strength bolting, welding, concrete placement, masonry, and geotechnical monitoring as required by IBC Chapter 17.

### CRITICAL REVIEW CATEGORIES:
Gravity Load Path, Lateral System, Foundation & Bearing, Connections & Anchorage, Reinforced Concrete Detailing, Structural Steel Detailing, Masonry / Timber Detailing, Material Schedule Consistency, Cross-Sheet Coordination, Progressive Collapse Risk, Special Inspections, Design Criteria, Drawing Completeness, Constructability.`;

const BRIDGE_ENGINEER_PROMPT = `### YOUR ANALYTICAL PROCESS (SENIOR BRIDGE ENGINEER):
1. **Vehicular & Environmental Loads**: Evaluate the structure for HL-93 live loading, wind on structure/live load, thermal expansion/contraction, stream flow / scour forces, vessel collision (if applicable), and seismic where governing.
2. **Superstructure Articulation**: Analyze the bearing layout. Verify expansion vs. fixed bearing locations are rational with the pier stiffness distribution. Ensure expansion joints have adequate movement capacity and are properly detailed to prevent water intrusion onto substructure caps.
3. **Substructure & Foundation**: Review pier/bent cap detailing, column reinforcement, footing/pile/drilled shaft sizing, pile bearing assumptions vs. geotech, scour elevations, and cofferdam/temporary works needs. Flag rebar congestion in drilled shaft / footing / cap connections and insufficient cover in splash zones.
4. **Fatigue & Detailing**: Check for AASHTO fatigue category traps at welded attachments, gusset plates, cross-frame connections, and deck-to-girder interfaces.
5. **Constructability & MOT**: Review the Maintenance of Traffic (MOT) and phasing. Ensure the bridge is stable during all intermediate stages of demolition and construction. Verify staging joints, closure pours, temporary bracing, and jacking provisions.
6. **Coordination**: Bridge vs. roadway geometry, drainage, utilities, lighting, ITS, and barrier/railing. Verify approach slab, wingwall, and MSE wall interfaces.
7. **Durability**: Corrosion protection in splash / marine zones, deck overlay, joint seals, and drainage.

### CRITICAL REVIEW CATEGORIES:
Superstructure Articulation, Bearing Layout & Restraint, Fatigue Detailing, Scour / Hydraulics Coordination, Phased Construction Stability, MOT, Post-Tensioning / Prestressing Detailing, Substructure Reinforcement, Foundation Adequacy, Corrosion / Durability, Standard Plan References, Cross-Discipline Coordination.

STEP: MAKE SURE EACH AND EVERY DETAIL MAKES SENSE IN THE DRAWING. POINT OUT TO THE USER:
- ANY DETAIL THAT NEEDS TO BE ADDED TO MAKE THE CONSTRUCTION STORY COMPLETE
- THINK AS IF YOU ARE GOING TO CONSTRUCT WITH THOSE PLANS, TELL WHAT DETAIL IS MISSING
- HELP USER MAKE INFORMED DECISION ON WHAT PART OF DETAIL IS MISSING
- SEE IF ANY DETAIL IS REPEATED AND NOT NECCESSARY
- SEE IF IT COMPLY WITH CORRECT CODE REQUIREMENTS 
- MAKE ASSUMPTIONS IF NECESSARY AND TELL USER TO INCLUDE THOSE DETAILS/NOTES.`;

const CONTRACTOR_PROMPT = `### YOUR ANALYTICAL PROCESS (SENIOR GENERAL CONTRACTOR / ESTIMATOR):
1. **Site & Logistics**: Look at the site plan. How does equipment get in? Where is the crane? Is there room for material laydown? Flag phasing or staging impossibilities.
2. **Mental Construction Sequence**: Build the project step-by-step from the dirt up:
    - *Earthwork & Utilities*: Are the under-slab utilities clashing with footings?
    - *Foundation*: Do the foundation dimensions close? Are elevations clear?
    - *Superstructure*: How are these connections actually made in the field? Is there tool clearance for bolting or welding?
    - *Envelope & Finishes*: Are the transitions constructible, or do they require impossible sequencing by different trades?
3. **Dimensional Verification**: Look for "closure" errors. Do the strings of architectural dimensions equal the overall structural dimensions? Do plan dimensions match section/elevation dimensions?
4. **Trade Clashes**: Look for spatial conflicts between structural framing, HVAC ducts, plumbing drops, sprinkler mains, electrical conduit racks, and architectural ceilings. Flag missing clearances above doors and below beams.
5. **Constructability Traps**: Flag details that look fine on paper but are notoriously difficult to execute (e.g., blind welds, rebar congestion that prevents concrete vibration, multi-trade flashing assemblies, unreachable fasteners, formwork that cannot be stripped).
6. **Means & Methods Constraints**: Flag designs that lock in a specific method (e.g., cast-in-place where precast is more practical, or vice versa) without acknowledging it.

### CRITICAL REVIEW CATEGORIES:
Constructability, Trade Coordination, Sequencing / Phasing, Dimensional Errors / Closure, Missing Elevations, Site Logistics, Means & Methods Constraints, Tool / Worker Access, Field Verification.`;

const GENERAL_STRUCTURAL_PROMPT = `### YOUR ANALYTICAL PROCESS (SENIOR STRUCTURAL REVIEWER — MIXED / UNKNOWN PROJECT):
1. **Classify First**: Determine project type (building, bridge, retaining structure, repair/retrofit, or mixed) and applicable code suite before proceeding.
2. **Gravity Load Path — Complete Trace**: Follow every load from the highest point to the soil. Name every member in the load path. Flag any gap.
3. **Lateral Load Path**: Identify the lateral system. Verify diaphragm-to-collector-to-shear-wall continuity. Check that all lateral connections are detailed.
4. **Foundation Adequacy**: Verify footing sizes, embedment depths, soil bearing reference, and pile/pier schedules.
5. **Connection & Anchorage Detail Review**: Every unique connection must have a complete detail with hardware, weld sizes, bolt sizes, and code basis.
6. **Drawing Completeness**: Verify drawing index, general notes, design criteria, all plan sheets, all section cuts, all referenced details, and all schedules are present.
7. **Material Specifications**: All structural materials (concrete f'c, rebar fy, steel ASTM grade, lumber species/grade, masonry fm) must be explicitly stated.
8. **Existing-Building / Repair Projects**: Review existing-condition assumptions, demolition limits, required shoring during construction, field verification requirements, corrosion mitigation, anchorage into existing structure (development length into existing concrete), material compatibility, phased construction sequence, and acceptance criteria for repairs.
9. **Cross-Sheet Coordination**: Trace 3 critical structural elements across every sheet they appear on and verify all data is consistent.
10. **Constructability & RFI Risk**: Identify every detail that will generate a field RFI. Resolve it now in the directive.

### CRITICAL REVIEW CATEGORIES:
Drawing Completeness, Design Criteria, Gravity Load Path, Lateral Load Path, Foundation / Substructure, Structural Member Consistency, Connections & Anchorage, Reinforced Concrete Detailing, Steel Detailing, Existing Conditions / Repair, Cross-Sheet Coordination, Constructability, Special Inspections.`;

const DISCIPLINE_PROMPTS: Record<Discipline, string> = {
  architect: ARCHITECT_PROMPT,
  building_engineer: BUILDING_ENGINEER_PROMPT,
  bridge_engineer: BRIDGE_ENGINEER_PROMPT,
  contractor: CONTRACTOR_PROMPT,
  general_structural: GENERAL_STRUCTURAL_PROMPT,
};

function buildCodeCompliancePrompt(discipline: Discipline, state = 'Applicable', year = 'Current'): string {
  let governingCodes = '';
  if (discipline === 'architect') {
    governingCodes = `${state} Building Code (${year} Edition), International Building Code (IBC), NFPA 101 Life Safety Code, ICC A117.1 / ADA Standards for Accessible Design, International Energy Conservation Code (IECC), applicable fire code (NFPA 1 / IFC)`;
  } else if (discipline === 'building_engineer') {
    governingCodes = `${state} Building Code (${year} Edition), IBC, ASCE 7 (Minimum Design Loads), ACI 318 (Concrete), AISC 360 (Steel) + AISC 341 (Seismic), NDS (Wood), TMS 402 (Masonry), ACI 530, AWS D1.1 (Welding)`;
  } else if (discipline === 'bridge_engineer') {
    governingCodes = `AASHTO LRFD Bridge Design Specifications (${year} Edition), AASHTO LRFD Bridge Construction Specifications, ${state} DOT Structures Design Guidelines / Manual, ${state} DOT Standard Specifications for Road and Bridge Construction, AWS D1.5 (Bridge Welding Code), applicable FHWA guidance`;
  } else if (discipline === 'contractor') {
    governingCodes = `${state} Building Code (${year} Edition), IBC, OSHA 1926 (Construction Safety), ACI 301 / ACI 117 (Concrete Construction & Tolerances), AISC 303 (Code of Standard Practice for Steel Buildings & Bridges), AWS D1.1 / D1.5 (Welding), applicable ${state} DOT Standard Specifications (if transportation scope), project specification book`;
  } else {
    governingCodes = `${state} Building Code (${year} Edition), IBC, ASCE 7, ACI 318, AISC 360, AASHTO LRFD (if bridge scope), ${state} DOT Structures Design Guidelines (if transportation scope)`;
  }

  return `### MANDATORY CODE COMPLIANCE AUDIT
You MUST evaluate the plans against the following governing criteria:
**${governingCodes}**

If you detect a detail, note, dimension, or configuration that violates a standard provision of these codes, you MUST cite the specific code section in your comment.

Format for Code Violations:
- comment_title: prefix with "[Code Violation]" followed by a brief description.
- comment_body: state the observed issue, then a sentence of the form: *"This appears to conflict with <Code/Standard> Section <Section Number>, which requires <brief summary of the rule>."*
- category: set to "Building Code" for building/architectural violations, "FDOT/Bridge" for AASHTO / state DOT violations, or "Compliance" for other referenced standards.

Examples:
- Bridge: "Bearing edge distance is shown as 4 inches. This appears to conflict with AASHTO LRFD Section 14.8.3, which requires a minimum edge distance based on the bearing dimensions."
- Building: "Shear wall aspect ratio exceeds 2:1 without boundary element detailing. This appears to conflict with ACI 318 Chapter 18 provisions for special structural walls."
- Architectural: "Corridor dead-end length scales to ~30 ft in a Group B occupancy. This appears to conflict with IBC Section 1020.4, which limits dead-end corridors to 20 ft (50 ft with sprinklers)."

If you are not certain of the exact section number, cite the specific Standard (e.g., "AASHTO LRFD Chapter 5", "IBC Chapter 10") and flag the finding as a "Potential Code Discrepancy" for the Engineer/Architect of Record to verify. Do NOT fabricate section numbers.`;
}

const OUTPUT_CONTRACT = `### ANNOTATION / MARKUP REQUIREMENTS
For every issue found, create a PDF-ready annotation with: annotation_id, page_number, sheet_number, sheet_title, location_description, markup_type, severity, category, comment_title, comment_body, recommended_action, confidence, cross_references, needs_human_engineer_review.

Severity levels:
- Critical: life-safety, major load-path break, instability, serious code violation.
- Major: significant missing info, inconsistency, constructability issue, likely RFI / change order.
- Moderate: incomplete/ambiguous info needing clarification.
- Minor: drafting / notation / reference cleanup.

Markup types: cloud, rectangle, arrow, pin_comment, highlight, strikeout, dimension_query, section_callout_query, coordination_flag, missing_info_flag.

Categories (choose the most specific match): Drawing Completeness, Design Criteria, Gravity Load Path, Lateral Load Path, Foundation/Substructure, Superstructure, Connection/Anchorage, Reinforced Concrete, Structural Steel, Masonry, Timber, Existing Conditions, Repair Detail, Demolition/Temporary Support, FDOT/Bridge, Building Code, Egress/Life Safety, Fire Protection, Accessibility, Building Envelope, Coordination, Constructability, Field Verification, Drafting/Reference, Compliance.

### EXAMPLES OF SENIOR ENGINEER REDLINES

BAD (Vague/Observational):
{
  "comment_title": "Lintel Locations Not Specified",
  "engineering_justification": "There are no lintels shown on the plan.",
  "cad_directive": "You should probably add lintels over the windows."
}

GOOD (Authoritative/Prescriptive):
{
  "comment_title": "Missing Masonry Lintel Schedule & Callouts",
  "engineering_justification": "Architectural elevations show 8'-0\" wide openings in the CMU bearing wall, but Structural Sheet S-101 lacks lintel callouts or a schedule to support these spans.",
  "cad_directive": "Add a standard Masonry Lintel Schedule to S-101. Tag all openings wider than 3'-0\" on the plan with the corresponding lintel type. For the 8'-0\" openings, detail a precast or fully grouted CMU lintel with minimum (2) #5 bottom bars and 8-inch bearing."
}

BAD (Vague/Observational):
{
  "comment_title": "Inadequate Concrete Specification",
  "engineering_justification": "The concrete strength seems low.",
  "cad_directive": "Verify concrete strength."
}

GOOD (Authoritative/Prescriptive):
{
  "comment_title": "Concrete Compressive Strength Non-Compliant for Exposure",
  "engineering_justification": "General Notes specify f'c = 2500 psi for exterior flatwork. Per ACI 318 Table 19.3.2.1, exterior concrete exposed to freezing and thawing (Class F2) requires a minimum f'c of 4500 psi.",
  "cad_directive": "Revise Structural General Note 4.A to specify f'c = 4500 psi (air-entrained) for all exterior slabs and pavements. Update mix design requirements accordingly."
}

### COORDINATE / LOCATION HANDLING
Return coordinates using normalized page coordinates (x1,y1 upper-left, x2,y2 lower-right, values 0.000-1.000). If exact coordinates are unavailable, set them to null and provide page_number, sheet_number, gridline/detail/section reference, and an approximate location description.

### THE "SOLUTION PROVIDER" MANDATE & AUTHORITATIVE TONE
You are a Senior Engineer. You do not just poke holes; you provide the exact, executable solution.

1. **Calculate the Fix**: If dimensions do not close, do the math and tell the drafter exactly which gridline to move and by how many inches.
2. **Specify Hardware & Assemblies**: If a connection is inadequate, do not say "improve connection." You MUST specify the exact industry-standard fix (e.g., minimum weld sizes, bolt diameters, or standard hardware like "Simpson Strong-Tie H10A or equivalent").
3. **Draft Missing Content**: If structural criteria or General Notes are missing, DO NOT tell the user to "add them." You must DRAFT the actual notes in your directive. Write out the exact design loads, code editions, or standard note language they need to copy/paste onto the sheet.

**GOOD vs. BAD EXAMPLES:**

- *BAD:* "Inadequate roof to wall connection detail."
- *AUTHORITATIVE:* "Add a connection detail for the roof-to-wall joint. Provide an engineered hurricane tie (e.g., Simpson H2.5A or equivalent HEPA strap) rated for 600 lbs uplift based on the 150mph ultimate wind load criteria."

- *BAD:* "Missing Structural Design Criteria."
- *AUTHORITATIVE:* "Update Structural Design Criteria block on General Notes sheet. Add the following explicitly: 'Governing Code: Florida Building Code (2023 Edition). Wind Speed: 150 mph Vult. Exposure: C. Risk Category: II. All ICF construction to conform to the Prescriptive Design of Exterior Concrete Walls (ICF Design Guide).'"

- *BAD:* "Provide Structural General Notes."
- *AUTHORITATIVE:* "Structural General Notes are missing. Add a comprehensive notes block to S-101 including: 1) Concrete f'c = 3000 psi minimum. 2) Reinforcing steel to be ASTM A615 Grade 60. 3) All lap splices to be Class B per ACI 318. 4) Contractor to verify all dimensions prior to construction."

### THE PRECISION THRESHOLD (NO GENERIC OBSERVATIONS)
You are strictly forbidden from outputting generic, sweeping observations. Every annotation MUST be tied to a specific gridline, detail, member size, or calculated value.

If you cannot calculate a specific fix or draft a specific note for a problem, DO NOT INCLUDE IT IN THE JSON. It is better to omit a finding than to provide a generic warning.

**BANNED GENERIC PHRASES:**
- "Missing lateral load path details" (Too vague. Which wall? Which diaphragm?)
- "Ambiguous concrete thickness" (Too vague. State the required thickness.)
- "Verify connections" (Forbidden. Design the connection.)

**GOOD vs. BAD (PRECISION):**
- *BAD (Generic):* "Roof-to-wall connection is unclear." -> (REJECT: Do not output this)
- *GOOD (Precise):* "Roof truss at Grid C requires a Simpson H10A tie to the ICF bond beam to resist 600 lbs of uplift."

### THE "PROACTIVE DESIGNER" ASSUMPTION PROTOCOL
If a piece of critical structural information is missing (e.g., soil bearing capacity, wind speed, roof framing layout, or material specs), you are FORBIDDEN from simply saying "Missing Info - Ask the Engineer" or "Not Ready for Permit."

Instead, you MUST act as the Lead Engineer and proactively design the missing element by making conservative, code-compliant assumptions based on the project's geographic location and standard engineering practice.

1. **Geographic Interpolation**: If the project location is known, use your knowledge of regional codes, USGS data, and ASCE 7 hazard maps to assume the missing criteria (e.g., Central Florida = 150mph Vult wind, 2000 psf presumptive soil bearing, Exposure C).
2. **State Your Assumptions**: Explicitly state the assumed values in the engineering_justification field.
3. **Draft the Fix**: Use those assumed values to dictate the exact CAD fix or draft the exact General Notes required.

**GOOD vs. BAD EXAMPLES (MISSING INFORMATION):**

- *BAD:* "Soil Bearing Capacity Not Stated. Footing sizes cannot be verified. Engage a geotechnical engineer."
- *AUTHORITATIVE / PROACTIVE:* "Soil Bearing Capacity is missing. Based on the Haines City, FL location, assume typical Central Florida sandy/cohesive soils (Site Class D). Assuming a conservative presumptive allowable bearing capacity of 2,000 psf per FBC. Add the following to Structural Notes: 'Foundation design is based on an assumed allowable soil bearing pressure of 2,000 psf. Contractor to verify soil conditions prior to pouring concrete.'"

- *BAD:* "Roof Framing Plan is missing. Load path is incomplete. Provide a roof framing plan."
- *AUTHORITATIVE / PROACTIVE:* "Roof Framing Plan is missing. For a 2,500 SF ICF residential structure in Florida, a pre-engineered wood truss system is standard. Add a Roof Framing Plan sheet. Draft note: 'Provide pre-engineered wood roof trusses at 24 inches on center. Trusses to be designed for 150 mph Vult wind speed, 20 psf live load. Attach trusses to ICF bond beam using Simpson H10A hurricane ties (or equivalent) embedded in concrete core.'"

### OUTPUT FORMAT
You MUST return your response in THREE parts, in this exact order. The order matters: writing the mental build FIRST grounds your context so the later annotations are evidence-based, not keyword-skim guesses.

PART A — PROJECT SYNTHESIS & MENTAL BUILD (your scratchpad)
Before critiquing the plans, you must understand them. Wrap this entire section in <mental_build> ... </mental_build> tags. Inside, you MUST address every numbered item:

1. **Project Definition**: State clearly: project type, occupancy/use, structural system (e.g., "3-story Type IIB steel-framed office, ~45,000 sf, RC II, MWFRS = X-braced frames, SFRS = concrete shear walls"). List all sheets visible.

2. **Step-by-Step Construction Narrative**: Build it from the ground up and narrate exactly what you see (or do not see) on the plans at each stage:
   - Excavation, dewatering, shoring requirements
   - Foundations: footing types, sizes, elevations, bearing assumption, pile/pier counts
   - Vertical structure: columns, bearing walls — sizes confirmed in schedule?
   - Floor framing: beam and joist layout, sizes, connections
   - Roof framing: members, slopes, drainage, connections
   - Lateral system: shear walls / braced frames / moment frames, hold-downs / base plates
   - Envelope: cladding type, flashing, waterproofing
   - MEP coordination: ceiling clearances, structural penetrations
   At each stage, state: "I CAN proceed" or "I CANNOT proceed because ___"

3. **Information Gaps Log**: Every place you get "stuck" must be a sentence: "I am placing rebar at Grid B4 but there is no footing dimension on S-101 — I CANNOT proceed." Every gap here MUST also appear as an annotation in PART C.

4. **MANDATORY DIMENSION CLOSURE MATH**: Write out at least ONE dimension string equation from the plans. Example: "S-101: 12'-0\" + 18'-6\" + 10'-0\" = 40'-6\" but overall = 41'-0\" → 6\" CLOSURE ERROR → flag." If you cannot find dimension strings, state that explicitly.

5. **MANDATORY CROSS-SHEET CORRELATION TRACES**: Trace exactly 3 critical elements across all sheets they appear on:
   Format: "[Element]: [Sheet A] shows [X] | [Sheet B] shows [Y] | [Schedule shows Z] → STATUS: CONSISTENT or CONFLICT: [explain]"
   Example: "Column C2: Foundation Plan S-101 = 24\"×24\" ftg | Framing Plan S-201 = HSS 6×6 col | Column Schedule = HSS 8×8 → CONFLICT: schedule vs. plan mismatch."

6. **CROSS-SHEET CHECKLIST RESULTS**: Go through the Step 3 checklist from the system prompt and write PASS/FAIL/N-A for each item:
   - GRIDLINES: [result]
   - MEMBER SIZES: [result]
   - ELEVATIONS: [result]
   - DIMENSION CLOSURE: [result]
   - SECTION CALLOUTS: [result]
   - CONNECTION DETAILS: [result]
   - REINFORCEMENT: [result]
   - SCHEDULES: [result]
   - NOTE CONSISTENCY: [result]
   - CROSS-DISCIPLINE: [result]

7. **COMPLETENESS AUDIT RESULTS**: List every missing sheet, missing detail, missing schedule, and missing note identified.

PART B — HUMAN-READABLE REVIEW SUMMARY
1. Project classification (based on the mental build above)
2. Overall plan quality assessment
3. Top risks by severity
4. Permit / bid / construction readiness opinion
5. Key missing information (cross-reference the gaps you logged in PART A)
6. Recommended next steps
Use language such as: "Based on AI-assisted QA/QC review, the plans appear to require clarification before construction."
End PART B with this disclaimer: "This is an AI-assisted QA/QC review intended to identify potential issues for review by a licensed engineer or architect. It is not a sealed engineering review, code approval, or construction authorization."

PART C — PDF ANNOTATION DATA
Return a JSON array named "annotations" immediately after the marker "---JSON_START---". Every gap you logged in PART A and every issue raised in PART B must be represented here as one or more annotations. Each annotation must follow this schema:
{"annotation_id":"SE-001","page_number":1,"sheet_number":"S-101","sheet_title":"FOUNDATION PLAN","location_description":"Grid B/3, center of foundation plan","coordinates_normalized":{"x1":0.25,"y1":0.35,"x2":0.40,"y2":0.40},"markup_type":"cloud","severity":"Major","category":"Gravity Load Path","comment_title":"Unclear column load path","engineering_justification":"Column appears on upper framing plan (S-201) at Grid B/3 but corresponding footing is not shown on foundation plan (S-101).","cad_directive":"Provide footing detail for column at Grid B/3 on S-101 or confirm column is supported on grade beam.","cross_references":["S-101","S-201"],"confidence":"Medium","needs_human_engineer_review":true}

**CRITICAL: page_number is REQUIRED**
- Every annotation MUST include the correct page_number (1-indexed, e.g., page 1, page 2, etc.)
- The page_number MUST match the actual PDF page where the issue is located
- If an issue spans multiple pages, create separate annotations for each page
- DO NOT default all annotations to page 1 - you must accurately track which page each issue appears on

**CRITICAL: coordinates_normalized is REQUIRED**
- Every annotation MUST include valid coordinates_normalized with x1, y1 values
- coordinates_normalized uses normalized coordinates (0 to 1) where 0,0 is top-left and 1,1 is bottom-right of the page
- x1 and y1 MUST be numbers between 0 and 1 (e.g., 0.25, 0.5, 0.75)
- x2 and y2 are optional for point annotations but recommended for area annotations
- If you cannot determine exact coordinates, estimate based on the location_description (e.g., if "Grid B/3 center", estimate x1=0.5, y1=0.5 for center of page)
- DO NOT leave coordinates_normalized as null, undefined, or empty objects - you MUST provide numeric values
- Example: If issue is at top-left corner, use {"x1":0.1,"y1":0.1}
- Example: If issue is at center of page, use {"x1":0.5,"y1":0.5}
- Example: If issue is at bottom-right, use {"x1":0.9,"y1":0.9}

Note: For backward compatibility, you may also include "comment_body" and "recommended_action" fields, but the authoritative fields are "engineering_justification" and "cad_directive".

**cad_directive field**: A direct, imperative command to the drafting technician. If an entire system (like a Roof Framing Plan) or criteria block is missing, this field MUST contain the step-by-step instructions on how to draw it, what members to use, and the exact text notes to copy/paste onto the sheet. This field supports multi-line, detailed text paragraphs with full specifications, dimensions, and code references.

If you are drafting missing General Notes or complex criteria, the cad_directive string should contain the complete, comprehensive text formatted with clear numbering or bullet points.

End the JSON array with the marker "---JSON_END---".

### LIMITATIONS
Do NOT approve plans, certify compliance, represent yourself as licensed, replace the EOR/AOR, invent data, assume hidden sheets exist, ignore unreadable info, or make final capacity judgments. Return only issues grounded in visible plan evidence or missing required information.

### PRIORITIZATION
Prioritize findings in this order: 1) Life safety 2) Load path / structural stability 3) Code compliance 4) Foundation adequacy 5) Connection completeness 6) Existing-condition uncertainty 7) Constructability 8) Coordination 9) Drafting cleanup.`;

export function buildSystemPrompt(context?: ReviewContext): string {
  const discipline: Discipline = context?.discipline || 'general_structural';
  const persona = DISCIPLINE_PROMPTS[discipline];
  const codePrompt = buildCodeCompliancePrompt(discipline, context?.projectState, context?.codeYear);

  // Inject project memory if available
  let memoryInjection = '';
  if (context?.projectMemory) {
    memoryInjection = `
### ESTABLISHED PROJECT CONTEXT (DO NOT CONTRADICT THIS)
You have previously reviewed other sheets for this project. Here are your established notes, assumptions, and project parameters. Use this context to inform your current review and ensure continuity:
<previous_knowledge>
${context.projectMemory}
</previous_knowledge>
`;
  }

  let selectedCodesPrompt = '';
  if (context?.selectedCodes && context.selectedCodes.length > 0) {
    selectedCodesPrompt = `\n\n### APPLICABLE CODES\nThe user has selected the following codes for compliance review. You MUST reference these specific codes in your analysis:\n${context.selectedCodes.map((code) => `- ${code}`).join('\n')}`;
  }

  let codeFilesPrompt = '';
  if (context?.codeFiles && context.codeFiles.length > 0) {
    const maxContentLength = 10000; // Truncate to avoid exceeding context window
    codeFilesPrompt = `\n\n### UPLOADED CODE DOCUMENTS\nThe user has uploaded the following code documents. Use these as the authoritative reference for code compliance:\n${context.codeFiles.map((file) => `\n--- ${file.name} ---\n${file.content.slice(0, maxContentLength)}\n[Content truncated to ${maxContentLength} characters]`).join('\n\n')}`;
  }

  let seniorEngineerPrompt = '';
  if (context?.seniorEngineerMode) {
    seniorEngineerPrompt = `\n\n### SENIOR ENGINEER MODE
You are operating in Senior Engineer Mode. This means:
- You MUST perform mandatory math verification and write out equations in your mental build
- You MUST perform cross-sheet correlation traces for critical elements
- You MUST provide prescriptive CAD directives (not vague suggestions)
- Use the "engineering_justification" and "cad_directive" fields in your JSON output
- Be authoritative and direct in your findings
- The detailed processing framework (plan purpose understanding, solution-oriented directives) applies with even greater rigor
- You MUST show your work: write out calculations, load path analysis, and code references in your mental build
- Every finding MUST include: the problem (engineering_justification), the exact fix (cad_directive), and the supporting analysis`;
  }

  return `${BASE_PROMPT}${memoryInjection}\n\n${persona}\n\n${codePrompt}${selectedCodesPrompt}${codeFilesPrompt}${seniorEngineerPrompt}\n\n${OUTPUT_CONTRACT}`;
}

// (legacy monolithic SYSTEM_PROMPT removed - see buildSystemPrompt() above)

// ── Page rendering ───────────────────────────────────────────────────
const MAX_PAGES = 30;

async function renderPagesAsImages(
  pageCount: number,
  onProgress?: (msg: string) => void,
): Promise<PageImage[]> {
  const pages = Math.min(pageCount, MAX_PAGES);
  const images: PageImage[] = [];
  for (let i = 0; i < pages; i++) {
    onProgress?.(`Rendering page ${i + 1} of ${pages}...`);
    const canvas = document.createElement('canvas');
    const { width, height } = await renderPage(i, canvas, 1);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    images.push({ page: i + 1, base64: dataUrl.split(',')[1], width, height });
  }
  return images;
}
// ── API callers ──────────────────────────────────────────────────────

function buildPrompt(modeOpts?: ReviewModeOptions): string {
  const basePrompt = buildSystemPrompt(modeOpts?.context);
  
  let userFeedbackPrompt = '';
  if (modeOpts?.userFeedback) {
    userFeedbackPrompt = `\n\n### USER FEEDBACK / CORRECTIONS\nThe user has provided the following feedback or corrections to your previous analysis. You MUST incorporate this feedback and revise your review accordingly:\n\n${modeOpts.userFeedback}\n\nIMPORTANT: The user is telling you that your previous analysis had errors or missing information. Revise your review to address these specific points.`;
  }
  
  if (!modeOpts || modeOpts.mode === 'general') return basePrompt + userFeedbackPrompt;
  if (modeOpts.mode === 'compliance') {
    return basePrompt + userFeedbackPrompt + `\n\n### USER-SUPPLIED COMPLIANCE DOCUMENTS\nThe user has uploaded compliance reference documents. In addition to the standard review above, you MUST cross-reference the plans against the following documents and flag any non-compliance issues. For each such issue, set category to "Compliance" and cite the specific section/clause from the reference document in comment_body.\n\nCOMPLIANCE REFERENCE DOCUMENTS:\n${modeOpts.complianceDocs || '(none provided)'}\n`;
  }
  // askme mode
  return basePrompt + userFeedbackPrompt + `\n\n### USER QUESTION\nThe user has asked a specific question about the plans. Focus your review on answering this question:\n\n${modeOpts.question || '(no question provided)'}\n\n${modeOpts.referenceText ? `REFERENCE DOCUMENTS:\n${modeOpts.referenceText}` : ''}\n`;
}

async function callGemini(apiKey: string, images: PageImage[], modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  
  // Build contents array - include chat history for 'askme' mode
  let contents: any[] = [];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    contents = modeOpts.chatHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }
  
  // Add current user message with images
  const currentParts: any[] = [{ text: prompt + '\n\nAnalyze the following construction plan pages and provide your structural engineering review:' }];
  for (const img of images) {
    currentParts.push({ inline_data: { mime_type: 'image/jpeg', data: img.base64 } });
    currentParts.push({ text: `(Page ${img.page})` });
  }
  contents.push({ role: 'user', parts: currentParts });
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.1,
          topK: 32,
          topP: 0.8,
          maxOutputTokens: 8192,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callOpenAI(apiKey: string, images: PageImage[], modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  const content: any[] = [];
  // 'auto' detail lets OpenAI pick low/high per image; with our prompt + many pages,
  // 'high' on every page can blow past Tier-1 TPM (~30k) and produce a 429.
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.base64}`, detail: 'auto' } });
    content.push({ type: 'text', text: `(Page ${img.page})` });
  }

  // Build messages array - include chat history for 'askme' mode
  let messages: any[] = [];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    messages = modeOpts.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
  
  // Add current user message with images
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: 'Attached are the construction plan sheets for review:' },
      ...content // Your array of high-res image objects
    ]
  });
  
  // Add system message
  messages.push({
    role: 'system',
    content: prompt // Your Discipline Persona, Code Compliance, and Output Contract
  });

  const buildBody = (model: string) => JSON.stringify({
    model,
    messages,
    max_tokens: 16384,
    temperature: 0.2,
  });

  // Try gpt-5.4-mini first, with up to 2 retries on 429 (honoring Retry-After).
  // If still rate-limited, fall back to gpt-4o, which has higher TPM
  // on every tier. Better to get a slightly weaker review than no review.
  const tryModel = async (model: string, maxAttempts: number): Promise<{ ok: boolean; text: string; status: number }> => {
    let lastErr = '';
    let lastStatus = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: buildBody(model),
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, text: data.choices?.[0]?.message?.content ?? '', status: 200 };
      }
      lastStatus = res.status;
      const bodyText = await res.text();
      lastErr = `OpenAI (${model}) error ${res.status}: ${bodyText}`;
      if (res.status === 429) {
        // Surface the exact limit type (tokens / requests / tokens_per_day / etc.)
        const limitType = bodyText.match(/limit_type: (\w+)/)?.[1] || 'unknown';
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000 * attempt;
        console.warn(`[callOpenAI] 429 (limit_type: ${limitType}), attempt ${attempt}/${maxAttempts}, retrying after ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    return { ok: false, text: lastErr, status: lastStatus };
  };

  const primary = await tryModel('gpt-4o-mini', 3);
  if (primary.ok) return primary.text;

  // Only fall back if the failure was a rate limit; auth/quota errors won't be helped by switching models.
  if (primary.status === 429) {
    console.warn('[callOpenAI] gpt-4o-mini rate-limited after retries; falling back to gpt-4o.');
    const fallback = await tryModel('gpt-4o', 2);
    if (fallback.ok) return fallback.text;
    throw new Error(`${primary.text}\nFallback also failed → ${fallback.text}`);
  }
  throw new Error(primary.text);
}

async function callAnthropic(apiKey: string, images: PageImage[], modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  const content: any[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const isLastImage = i === images.length - 1;

    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img.base64 },
      ...(isLastImage && { cache_control: { type: "ephemeral" } })
    });
    content.push({ type: 'text', text: `(Page ${img.page})` });
  }

  // Use Anthropic SDK for better error handling and model support
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Build messages array - include chat history for 'askme' mode
  let messages: any[] = [];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    messages = modeOpts.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
  
  // Add current user message
  messages.push({ role: 'user', content });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      system: prompt,
      messages,
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    if (!text) {
      console.error('Anthropic returned empty response:', msg);
      throw new Error('Anthropic returned empty response');
    }
    return text;
  } catch (error: any) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic error: ${error.message || 'Unknown error'}`);
  }
}

async function callKimi(apiKey: string, images: PageImage[], modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  const content: any[] = [];
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.base64}` } });
    content.push({ type: 'text', text: `(Page ${img.page})` });
  }

  // Build messages array - include chat history for 'askme' mode
  let messages: any[] = [{ role: 'system', content: prompt }];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    messages.push(...modeOpts.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })));
  }
  
  // Add current user message with images
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: 'Analyze the following construction plan pages and provide your structural engineering review:' }, ...content]
  });

  const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/kimi-k2p6',
      max_tokens: 4096,
      top_p: 1,
      top_k: 40,
      presence_penalty: 0,
      frequency_penalty: 0,
      temperature: 0.6,
      messages,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Kimi API error:', errorText);
    throw new Error(`Kimi error ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    console.error('Kimi returned empty response:', data);
    throw new Error('Kimi returned empty response');
  }
  return text;
}

async function callQwen(apiKey: string, images: PageImage[], modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  const content: any[] = [];
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.base64}` } });
    content.push({ type: 'text', text: `(Page ${img.page})` });
  }

  // Build messages array - include chat history for 'askme' mode
  let messages: any[] = [{ role: 'system', content: prompt }];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    messages.push(...modeOpts.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })));
  }
  
  // Add current user message with images
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: 'Analyze the following construction plan pages and provide your structural engineering review:' }, ...content]
  });

  const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages,
      max_tokens: 8192,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Qwen API error:', errorText);
    throw new Error(`Qwen error ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    console.error('Qwen returned empty response:', data);
    throw new Error('Qwen returned empty response');
  }
  return text;
}

async function callDeepSeek(apiKey: string, extractedText: string, modeOpts?: ReviewModeOptions): Promise<string> {
  const prompt = buildPrompt(modeOpts);
  // DeepSeek uses text-based analysis (no vision)
  const userContent = `Analyze the following construction plan text extracted from a PDF and provide your structural engineering review:\n\n${extractedText.slice(0, 100000)}`;
  
  // Build messages array - include chat history for 'askme' mode
  let messages: any[] = [{ role: 'system', content: prompt }];
  
  if (modeOpts?.mode === 'askme' && modeOpts.chatHistory) {
    // Add previous chat history
    messages.push(...modeOpts.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })));
  }
  
  // Add current user message
  messages.push({ role: 'user', content: userContent });
  
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-reasoner',
      messages,
      max_tokens: 8192, // DeepSeek caps at 8192
      // Removed temperature - reasoner model doesn't support it well
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('DeepSeek API error:', errorText);
    throw new Error(`DeepSeek error ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    console.error('DeepSeek returned empty response:', data);
    throw new Error('DeepSeek returned empty response');
  }
  return text;
}

// ── Deterministic rule checks ────────────────────────────────────────

function deterministicChecks(text: string, pageCount: number): ReviewAnnotation[] {
  const anns: ReviewAnnotation[] = [];
  let id = 1;
  const make = (sev: ReviewAnnotation['severity'], cat: string, title: string, justification: string, directive: string, pageNum: number = 1) => {
    const yOffset = 0.05 + (id - 1) * 0.12; // Stagger vertically
    anns.push({
      annotation_id: `DET-${String(id++).padStart(3, '0')}`,
      page_number: pageNum,
      location_description: pageNum === 1 ? 'General / Title Sheet' : `Page ${pageNum}`,
      coordinates_normalized: { x1: 0.05, y1: Math.min(yOffset, 0.9), x2: 0.4, y2: Math.min(yOffset + 0.05, 0.95) },
      markup_type: 'missing_info_flag',
      severity: sev,
      category: cat,
      comment_title: title,
      engineering_justification: justification,
      cad_directive: directive,
      confidence: 'High',
      needs_human_engineer_review: false,
      source_model: 'Deterministic',
    });
  };

  const upper = text.toUpperCase();

  // Distribute annotations across pages
  let currentPage = 1;
  const getNextPage = () => {
    const page = currentPage;
    currentPage = currentPage < pageCount ? currentPage + 1 : 1;
    return page;
  };

  // ── DRAWING COMPLETENESS ─────────────────────────────────────────
  if (!upper.includes('SCALE') && !upper.includes('1"=') && !upper.includes("1'=") && !upper.includes('1/') ) {
    make('Moderate', 'Drawing Completeness', 'Missing Scale Notation', 'No scale reference was found in the extracted text. Unscaled drawings cannot be used for construction.', 'Provide a graphic scale bar AND a written scale (e.g., "1\" = 20\'") on all plan, section, elevation, and detail sheets per standard drafting practice.', getNextPage());
  }
  if (!upper.includes('NORTH') && !upper.includes('N.T.S') ) {
    make('Minor', 'Drawing Completeness', 'Missing North Arrow', 'No North Arrow or "NORTH" keyword found on any plan sheet. Orientation is required for all plan-view drawings.', 'Add a North Arrow to all plan-view sheets (site plan, floor plans, foundation plan, framing plan) to establish global orientation for field use.', getNextPage());
  }
  if (!upper.includes('DRAWING LIST') && !upper.includes('SHEET INDEX') && !upper.includes('INDEX OF DRAWINGS') && !upper.includes('LIST OF DRAWINGS')) {
    make('Major', 'Drawing Completeness', 'Missing Drawing Index / Sheet List', 'No sheet index or list of drawings was found. Without a drawing index, the contractor cannot confirm a complete set has been received.', 'Add a Drawing Index (Sheet List) to the cover or G-001 sheet listing every sheet number, sheet title, and revision status in the set.', 1);
  }
  if (!upper.includes('REVISION') && !upper.includes('REV.') && !upper.includes('REV #')) {
    make('Minor', 'Drawing Completeness', 'Missing Revision Block', 'No revision block or revision history was detected. Revision tracking is required for permit, construction, and record document control.', 'Add a Revision Block to the title block on all sheets. Include columns for: Rev. No., Description, Date, and Initials/Seal.', getNextPage());
  }

  // ── DESIGN CRITERIA ──────────────────────────────────────────────
  const codeKeywords = ['IBC', 'ASCE 7', 'ACI 318', 'AISC', 'FDOT', 'AASHTO', 'NDS', 'TMS', 'FLORIDA BUILDING CODE', 'CBC', 'NFPA', 'AWS D1'];
  if (!codeKeywords.some((k) => upper.includes(k))) {
    make('Major', 'Design Criteria', 'Missing Governing Design Codes', 'No standard code references (IBC, ASCE 7, ACI 318, AISC, etc.) were found in the document text. The governing code edition and all referenced material standards are mandatory on the General Notes sheet.', 'Add the following to the Structural Design Criteria block on the General Notes sheet:\n- Governing Code: [State Building Code, Year Edition] per IBC [Year]\n- Structural Design: ASCE 7-[Year]\n- Concrete: ACI 318-[Year]\n- Structural Steel: AISC 360-[Year]\n- Wood: NDS [Year]\n- Masonry: TMS 402/602-[Year]', 1);
  }
  if (!upper.includes('GENERAL NOTES') && !upper.includes('STRUCTURAL NOTES') && !upper.includes('STRUCTURAL GENERAL') && !upper.includes('G.N.') && !upper.includes('GENERAL NOTE')) {
    make('Major', 'Drawing Completeness', 'Missing General Notes Sheet', 'No structural or architectural general notes sheet was detected. General Notes are a mandatory submittal requirement for permit and construction.', 'Incorporate a comprehensive Structural General Notes sheet (S-001 or G-001) covering: 1) Governing codes and editions. 2) Design loads table. 3) Material specifications (f\'c, fy, ASTM grades). 4) Standard connection requirements. 5) Special inspection requirements. 6) Geotechnical reference. 7) Contractor responsibilities.', getNextPage());
  }
  const loadKeywords = ['LIVE LOAD', 'DEAD LOAD', 'WIND SPEED', 'SEISMIC', 'RISK CATEGORY', 'EXPOSURE', 'SNOW LOAD', 'WIND LOAD'];
  const foundLoads = loadKeywords.filter((k) => upper.includes(k));
  if (foundLoads.length < 3) {
    make('Major', 'Design Criteria', 'Incomplete Design Load Criteria', `Only ${foundLoads.length} of 8 essential design load keywords found (${foundLoads.join(', ') || 'none'}). Incomplete load criteria prevents independent verification of structural adequacy.`, 'Add a Design Loads table to the General Notes sheet specifying:\n- Floor Live Load: ___ psf\n- Roof Live Load: ___ psf (or snow: ___ psf)\n- Roof Dead Load: ___ psf (include MEP, insulation, roofing)\n- Floor Dead Load (superimposed): ___ psf\n- Wind Speed: ___ mph (Vult), Exposure Category ___\n- Seismic: SS=___, S1=___, Site Class ___, SDC ___\n- Risk Category: ___ (per IBC Table 1604.5)', getNextPage());
  }
  if (!upper.includes('RISK CATEGORY') && !upper.includes('OCCUPANCY CATEGORY') && !upper.includes('IMPORTANCE FACTOR')) {
    make('Major', 'Design Criteria', 'Missing Risk Category / Occupancy Classification', 'Risk Category (IBC Table 1604.5) was not found. This parameter drives the design wind, seismic, and snow loads and must be explicitly stated.', 'Add to Design Criteria block: "Risk Category: II (or I/III/IV as applicable per IBC Table 1604.5). Importance Factor Iw=1.0, Ie=1.0."', getNextPage());
  }
  if (!upper.includes('WIND') && !upper.includes('MPH') && !upper.includes('VULT') && !upper.includes('V_ULT')) {
    make('Major', 'Design Criteria', 'Missing Wind Design Criteria', 'No wind speed or wind design parameters were found. Wind loading is a governing load for most structures and must be explicitly stated.', 'Add to Design Criteria: "Basic Wind Speed: ___ mph (Vult per ASCE 7 Figure 26.5-1), Exposure Category ___, Enclosure Classification: Enclosed/Partially Enclosed."', getNextPage());
  }
  if (!upper.includes('SEISMIC') && !upper.includes('SDC') && !upper.includes('SDS') && !upper.includes('EARTHQUAKE')) {
    make('Moderate', 'Design Criteria', 'Missing Seismic Design Criteria', 'No seismic design parameters (SDC, SDS, SD1) were found. Required for all structures per IBC/ASCE 7 unless exempted.', 'Add to Design Criteria: "Seismic Design Category: ___, SDS=___, SD1=___, Site Class ___, R=___, Ie=___."', getNextPage());
  }

  // ── MATERIAL SPECIFICATIONS ──────────────────────────────────────
  if (!upper.includes("F'C") && !upper.includes("FC =") && !upper.includes('COMPRESSIVE STRENGTH') && !upper.includes('3000 PSI') && !upper.includes('4000 PSI') && !upper.includes('5000 PSI')) {
    make('Major', 'Design Criteria', 'Missing Concrete Compressive Strength (f\'c)', 'No concrete compressive strength (f\'c) specification was found. This is a required material specification for all concrete structures.', "Add to Structural Notes: 'Concrete compressive strength (f'c) = [3000/4000/5000] psi minimum at 28 days. All concrete shall conform to ACI 318. Air-entrained concrete required for exterior exposure (f'c ≥ 4500 psi for freeze-thaw per ACI 318 Table 19.3.2.1).'", getNextPage());
  }
  if (!upper.includes('REBAR') && !upper.includes('REINFORCING') && !upper.includes('ASTM A615') && !upper.includes('GRADE 60') && !upper.includes('FY =') && !upper.includes("FY=")) {
    make('Major', 'Design Criteria', 'Missing Reinforcing Steel Specification', 'No reinforcing steel grade or specification (fy, ASTM A615 Gr. 60) was found.', "Add to Structural Notes: 'Reinforcing steel shall conform to ASTM A615, Grade 60 (fy = 60,000 psi). Epoxy-coated bars required where indicated per ACI 318 Section 20.6.1.'", getNextPage());
  }
  if (!upper.includes('ASTM A36') && !upper.includes('ASTM A992') && !upper.includes('A500') && !upper.includes('STRUCTURAL STEEL') && upper.includes('STEEL')) {
    make('Moderate', 'Design Criteria', 'Missing Structural Steel ASTM Grade', 'Structural steel is referenced but no ASTM designation (A992, A36, A500) was found.', 'Add to Structural Notes: "Wide-flange shapes: ASTM A992 (Fy=50 ksi). Plates and angles: ASTM A36 (Fy=36 ksi). HSS sections: ASTM A500 Grade C (Fy=50 ksi). All steel to conform to AISC 360."', getNextPage());
  }

  // ── FOUNDATION & GEOTECH ─────────────────────────────────────────
  if (!upper.includes('BEARING') && !upper.includes('SOIL') && !upper.includes('GEOTECH') && !upper.includes('GEOTECHNICAL') && !upper.includes('ALLOWABLE BEARING')) {
    make('Major', 'Foundation/Substructure', 'Missing Soil Bearing Capacity / Geotechnical Reference', 'No soil bearing capacity, geotechnical report reference, or foundation design assumptions were found. Without this, footing sizes cannot be independently verified.', "Add to Structural Notes: 'Foundation design based on minimum allowable soil bearing pressure of [2,000] psf. Contractor shall verify soil conditions at each footing location prior to placement. A geotechnical report by [Firm Name] dated [Date] is the basis of foundation design and is part of the contract documents.'", getNextPage());
  }

  // ── SPECIAL INSPECTIONS ──────────────────────────────────────────
  if (!upper.includes('SPECIAL INSPECTION') && !upper.includes('SPECIAL INSPECTOR') && !upper.includes('IBC CHAPTER 17') && !upper.includes('CHAPTER 17')) {
    make('Major', 'Special Inspections', 'Missing Special Inspection Program Requirements', 'No Special Inspection Program (SIP) reference was found. Per IBC Section 1705, special inspections are required for concrete, high-strength bolting, welding, masonry, and geotechnical work.', 'Add a Special Inspection statement to the General Notes: "A Special Inspection Program per IBC Chapter 17 is required for this project. The Owner shall engage a Special Inspector for: concrete placement and testing, high-strength bolting, structural welding, masonry construction, and soil compaction testing. See Statement of Special Inspection."', getNextPage());
  }

  // ── CONNECTIONS & WELDING ────────────────────────────────────────
  if (upper.includes('WELD') && !upper.includes('AWS') && !upper.includes('AWS D1') && !upper.includes('FILLET WELD') && !upper.includes('CJP') && !upper.includes('PJP')) {
    make('Moderate', 'Connections & Anchorage', 'Welding Referenced Without AWS Standard', 'Welding is shown or referenced but the governing welding standard (AWS D1.1 or D1.3) is not cited. Without the welding standard, weld type and quality requirements are ambiguous.', 'Add to Structural Notes: "All structural welding shall conform to AWS D1.1 Structural Welding Code — Steel (latest edition). Weld sizes shown are minimum fillet weld sizes unless noted as CJP or PJP. All field welds require Special Inspection per IBC Chapter 17."', getNextPage());
  }
  if (upper.includes('BOLT') && !upper.includes('ASTM F3125') && !upper.includes('A325') && !upper.includes('A490') && !upper.includes('SAE GRADE')) {
    make('Moderate', 'Connections & Anchorage', 'Bolt Grade Not Specified', 'Bolts are referenced but the bolt ASTM grade (F3125 Gr. A325, A490, or F1554 for anchor rods) is not specified.', 'Add to Structural Notes: "High-strength bolts: ASTM F3125 Grade A325 minimum. Anchor rods: ASTM F1554 Grade 36 or 55 as required. Bolt installation: Snug-Tight for shear connections, Pre-tensioned for slip-critical connections (per AISC 360 Table J3.1)."', getNextPage());
  }

  // ── CROSS-REFERENCE INTEGRITY ────────────────────────────────────
  const detailCalloutPattern = /(?:SEE DETAIL|DTL\.|DET\.)\s*[\d\/A-Z-]+/gi;
  const detailCallouts = text.match(detailCalloutPattern) || [];
  if (detailCallouts.length > 0 && !upper.includes('DETAIL SHEET') && !upper.includes('D-') && !upper.includes('/D') ) {
    make('Major', 'Cross-Sheet Coordination', 'Detail Callouts May Reference Missing Detail Sheets', `${detailCallouts.length} detail callouts found in text (e.g., ${detailCallouts.slice(0,3).join(', ')}), but no dedicated detail sheet appears to be present. Every callout bubble must have a corresponding detail drawing.`, 'Audit all detail callout bubbles on every plan sheet. For each callout, confirm a corresponding detail exists on a detail sheet. Add missing detail sheets or remove dangling callouts. All details must be referenced bidirectionally (plan references detail, detail notes the source sheet).', getNextPage());
  }
  const sectionCalloutPattern = /(?:SEE SECTION|SECT\.|SECTION)\s*[\d\/A-Z-]+/gi;
  const sectionCallouts = text.match(sectionCalloutPattern) || [];
  if (sectionCallouts.length > 0 && pageCount <= 3) {
    make('Major', 'Cross-Sheet Coordination', 'Section Callouts Present But Insufficient Section Sheets', `${sectionCallouts.length} section callouts found but the set has only ${pageCount} page(s). Referenced section drawings may be missing.`, 'Verify every section cut shown on plan sheets has a corresponding section drawing. Add all missing section sheets. Label sections with the sheet number and detail number where the section is drawn.', getNextPage());
  }

  // ── CONSTRUCTION SEQUENCING & PHASING ───────────────────────────
  if (upper.includes('DEMOLISH') || upper.includes('DEMOLITION') || upper.includes('REMOVE EXISTING')) {
    if (!upper.includes('SHORING') && !upper.includes('TEMPORARY SUPPORT') && !upper.includes('BRACE') && !upper.includes('SEQUENCE')) {
      make('Critical', 'Constructability', 'Demolition Work Without Temporary Shoring / Sequencing Notes', 'Demolition or removal of existing structural elements is indicated but no temporary shoring, bracing, or construction sequence notes were found. This is a life-safety concern.', 'Add a Demolition Sequence note to the drawings: "Prior to removal of any existing structural element, contractor shall submit a temporary shoring and bracing plan to the Engineer of Record for review. Shoring must be designed by a licensed engineer. Do not remove any structural member without approved shoring in place."', getNextPage());
    }
  }
  if ((upper.includes('PHASE') || upper.includes('PHASED') || upper.includes('STAGING')) && !upper.includes('PHASE 1') && !upper.includes('CONSTRUCTION SEQUENCE')) {
    make('Moderate', 'Constructability', 'Phased Construction Referenced Without Phasing Plan', 'Phased construction is referenced but no phasing plan or construction sequence diagram was found.', 'Add a Construction Phasing Plan sheet or phasing diagram. Clearly delineate Phase 1, Phase 2, etc. boundaries on the site plan. Specify which structural elements must be in place before proceeding to the next phase.', getNextPage());
  }

  // ── ACCESSIBILITY & LIFE SAFETY ──────────────────────────────────
  if ((upper.includes('STAIR') || upper.includes('STAIRS') || upper.includes('STAIRWAY')) && !upper.includes('RISER') && !upper.includes('TREAD')) {
    make('Major', 'Egress / Life Safety', 'Stair Dimensions Not Specified', 'Stairway is shown but riser height and tread depth dimensions are missing. IBC Section 1011 requires riser height ≤ 7\" and tread depth ≥ 11\" for commercial occupancies.', 'Provide a Stair Detail showing: riser height (max 7\" commercial, 7-3/4\" residential), tread depth (min 11\" commercial, 10\" residential), stairwell width, handrail height (34\"-38\" AFF), handrail extensions, and landing sizes. Calculate and verify: (number of risers × riser height = floor-to-floor height).', getNextPage());
  }
  if ((upper.includes('RAMP')) && !upper.includes('1:12') && !upper.includes('SLOPE') && !upper.includes('8.33%')) {
    make('Major', 'Accessibility', 'Ramp Slope Not Specified', 'A ramp is shown but the slope, landing sizes, and handrail requirements are not specified. ADA/ICC A117.1 requires max 1:12 (8.33%) slope for accessible ramps.', 'Add a Ramp Detail specifying: slope (max 1:12 = 8.33%), landing dimensions (min 60\"×60\" at top and bottom), handrail height (34\"-38\" AFF), edge protection, and surface texture. Label the slope ratio explicitly on the plan.', getNextPage());
  }

  return anns;
}

// ── Response parsing ─────────────────────────────────────────────────

function parseResponse(raw: string, modelName: string): { summary: string; scratchpad: string; annotations: ReviewAnnotation[] } {
  let summary = raw;
  let scratchpad = '';
  let annotations: ReviewAnnotation[] = [];

  // Extract the scratchpad
  const scratchpadMatch = raw.match(/<mental_build>([\s\S]*?)<\/mental_build>/i);
  if (scratchpadMatch) {
    scratchpad = scratchpadMatch[1].trim();
  }

  // Coerce whatever JSON.parse produced into a flat array of annotation objects.
  // Different models return slightly different shapes:
  //   - bare array:        [ {...}, {...} ]
  //   - wrapped object:    { "annotations": [ {...} ] }
  //   - single object:     { "annotation_id": "SE-001", ... }
  //   - nested under name: { "name": "annotations", "value": [...] }
  const coerceToArray = (parsed: any): ReviewAnnotation[] => {
    if (Array.isArray(parsed)) return parsed as ReviewAnnotation[];
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.annotations)) return parsed.annotations as ReviewAnnotation[];
      if (Array.isArray(parsed.value)) return parsed.value as ReviewAnnotation[];
      if (Array.isArray(parsed.items)) return parsed.items as ReviewAnnotation[];
      if (Array.isArray(parsed.data)) return parsed.data as ReviewAnnotation[];
      // Single annotation object?
      if (typeof parsed.annotation_id === 'string' || typeof parsed.comment_title === 'string') {
        return [parsed as ReviewAnnotation];
      }
    }
    return [];
  };

  // Try extracting JSON between markers
  const jsonStart = raw.indexOf('---JSON_START---');
  const jsonEnd = raw.indexOf('---JSON_END---');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    summary = raw.slice(0, jsonStart).trim();
    // Remove scratchpad from summary for display
    summary = summary.replace(/<mental_build>[\s\S]*?<\/mental_build>/gi, '').trim();
    let jsonStr = raw.slice(jsonStart + 16, jsonEnd).trim();
    // Strip code fences models sometimes wrap the array in.
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      annotations = coerceToArray(JSON.parse(jsonStr));
    } catch { /* fallback below */ }
  }

  // Fallback 1: look for a JSON array anywhere in the text.
  if (annotations.length === 0) {
    const arrMatch = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrMatch) {
      try {
        annotations = coerceToArray(JSON.parse(arrMatch[0]));
        summary = raw.replace(arrMatch[0], '').trim();
      } catch { /* fall through */ }
    }
  }

  // Fallback 2: look for an object with an "annotations" key.
  if (annotations.length === 0) {
    const objMatch = raw.match(/\{\s*"annotations"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (objMatch) {
      try {
        annotations = coerceToArray(JSON.parse(objMatch[0]));
      } catch { /* no annotations */ }
    }
  }

  // Remove the mental-build scratchpad and markdown/JSON fences from the user-visible summary.
  // The <mental_build> block is intentionally kept in the raw model response so it grounds the
  // model's own reasoning (it is part of the same context window as the JSON), but humans
  // shouldn't see the raw scratchpad in the report UI.
  summary = summary
    .replace(/<mental_build>[\s\S]*?<\/mental_build>/gi, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/---JSON_START---[\s\S]*?---JSON_END---/g, '')
    .trim();

  // Tag each annotation with source model
  annotations = annotations.map((a) => ({ ...a, source_model: modelName }));
  return { summary, scratchpad, annotations };
}

// ── Main orchestrator ────────────────────────────────────────────────

export async function runPlanReview(
  tier: ReviewTier,
  keys: ReviewKeys,
  pageCount: number,
  onProgress?: (msg: string, model?: string) => void,
  onAnnotations?: (annotations: ReviewAnnotation[]) => void,
  modeOpts?: ReviewModeOptions,
): Promise<PlanReviewResult> {
  onProgress?.('Rendering PDF pages as images...');
  const images = await renderPagesAsImages(pageCount, onProgress);

  onProgress?.('Extracting text from PDF...');
  const extractedText = await extractAllText(pageCount);

  // DeepSeek is text-only (no vision). If the PDF has no usable text layer
  // (e.g., scanned image-only PDF), calling DeepSeek wastes a request and
  // produces "no input provided" output. Gate it behind a minimum text length.
  const hasUsableText = extractedText.trim().length >= 200;

  // Determine which models to call
  const calls: { name: string; fn: () => Promise<string> }[] = [];
  const preSkipped: PlanReviewResult['modelResults'] = [];
  if (tier === 'advanced') {
    if (keys.gemini) calls.push({ name: 'Gemini 2.5 Pro', fn: () => callGemini(keys.gemini, images, modeOpts) });
    if (keys.openai) calls.push({ name: 'GPT-5.4 Mini', fn: () => callOpenAI(keys.openai, images, modeOpts) });
    if (keys.anthropic) calls.push({ name: 'Claude Sonnet', fn: () => callAnthropic(keys.anthropic, images, modeOpts) });
    if (keys.kimi) calls.push({ name: 'Kimi K2P6 (Fireworks)', fn: () => callKimi(keys.kimi, images, modeOpts) });
    if (keys.qwen) calls.push({ name: 'Qwen Plus', fn: () => callQwen(keys.qwen, images, modeOpts) });
    if (keys.deepseek) {
      if (hasUsableText) {
        calls.push({ name: 'DeepSeek', fn: () => callDeepSeek(keys.deepseek, extractedText, modeOpts) });
      } else {
        preSkipped.push({ model: 'DeepSeek', status: 'error', count: 0, error: 'Skipped — PDF has no extractable text layer (image-only/scanned PDF). DeepSeek is text-only; use Gemini/GPT/Claude for vision-based review.' });
      }
    }
  } else {
    if (keys.gemini) calls.push({ name: 'Gemini 2.5 Pro', fn: () => callGemini(keys.gemini, images, modeOpts) });
    if (keys.kimi) calls.push({ name: 'Kimi K2P6 (Fireworks)', fn: () => callKimi(keys.kimi, images, modeOpts) });
    if (keys.qwen) calls.push({ name: 'Qwen Plus', fn: () => callQwen(keys.qwen, images, modeOpts) });
    if (keys.deepseek) {
      if (hasUsableText) {
        calls.push({ name: 'DeepSeek', fn: () => callDeepSeek(keys.deepseek, extractedText, modeOpts) });
      } else {
        preSkipped.push({ model: 'DeepSeek', status: 'error', count: 0, error: 'Skipped — PDF has no extractable text layer (image-only/scanned PDF). DeepSeek is text-only; use Gemini/GPT/Claude for vision-based review.' });
      }
    }
  }

  if (calls.length === 0) throw new Error('No API keys provided for the selected tier.');

  // Run all AI models in parallel
  onProgress?.(`Running ${calls.length} AI models in parallel...`);
  const results = await Promise.allSettled(
    calls.map(async (c) => {
      onProgress?.(`Running ${c.name}...`, c.name);
      const result = await c.fn();
      onProgress?.(`${c.name} complete`, c.name);
      return result;
    })
  );
  const modelResults: PlanReviewResult['modelResults'] = [...preSkipped];
  const allAnnotations: ReviewAnnotation[] = [];
  const summaries: string[] = [];
  const scratchpads: string[] = [];

  results.forEach((r, i) => {
    const name = calls[i].name;
    if (r.status === 'fulfilled') {
      const text = r.value;
      const parsed = parseResponse(text, name);
      modelResults.push({
        model: name,
        status: 'success',
        count: parsed.annotations.length,
      });
      allAnnotations.push(...parsed.annotations);
      onAnnotations?.(parsed.annotations);
      summaries.push(parsed.summary);
      if (parsed.scratchpad) {
        scratchpads.push(`### ${name} Mental Build\n${parsed.scratchpad}`);
      }
    } else {
      const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      modelResults.push({ model: name, status: 'error', error: errMsg, count: 0 });
      summaries.push(`## ${name}\n\n**Error:** ${errMsg}`);
    }
  });

  // Run deterministic checks for ALL tiers — these catch clerical and completeness errors
  onProgress?.('Running deterministic rule checks...');
  const detAnns = deterministicChecks(extractedText, pageCount);
  allAnnotations.push(...detAnns);
  modelResults.push({ model: 'Deterministic Rules', status: 'success', count: detAnns.length });

  // Clamp all annotation page numbers to valid range
  for (const ann of allAnnotations) {
    if (!ann.page_number || ann.page_number < 1) ann.page_number = 1;
    if (ann.page_number > pageCount) ann.page_number = Math.min(ann.page_number, pageCount);
  }

  const combinedSummary = summaries.join('\n\n---\n\n');
  const combinedScratchpad = scratchpads.join('\n\n---\n\n');
  
  // Save scratchpad to project memory if this is the first review and we have meaningful content
  if (combinedScratchpad && combinedScratchpad.length > 100) {
    await saveProjectMemory(combinedScratchpad, modeOpts?.context?.projectId);
  }
  
  return { summary: combinedSummary, scratchpad: combinedScratchpad, annotations: allAnnotations, modelResults };
}

// ── Project Memory Management ───────────────────────────────────────────

/**
 * Save scratchpad to project memory in Firestore
 */
async function saveProjectMemory(scratchpad: string, projectId?: string): Promise<void> {
  if (!projectId) return;
  
  try {
    const { getFirestore, doc, updateDoc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    const projectRef = doc(db, 'projects', projectId);
    
    // Check if project already has memory
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists() && !projectSnap.data().project_memory) {
      // Only save if no existing memory (first review)
      await updateDoc(projectRef, {
        project_memory: scratchpad,
        updated_at: new Date().toISOString()
      });
      console.log('Project memory saved successfully');
    }
  } catch (error) {
    console.error('Failed to save project memory:', error);
    // Don't throw - this is non-critical functionality
  }
}

/**
 * Load project memory from Firestore
 */
export async function loadProjectMemory(projectId: string): Promise<string | null> {
  try {
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    const projectRef = doc(db, 'projects', projectId);
    
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
      const data = projectSnap.data();
      return data.project_memory || null;
    }
    return null;
  } catch (error) {
    console.error('Failed to load project memory:', error);
    return null;
  }
}

/**
 * Merge existing project memory with new scratchpad using AI
 */
export async function mergeProjectMemory(
  existingMemory: string, 
  newScratchpad: string,
  apiKey: string
): Promise<string> {
  try {
    // Use a fast, cheap model for merging (Fireworks/Llama)
    const prompt = `You are updating project memory for a construction plan review. Merge the existing project knowledge with new insights from the latest sheet review.

EXISTING PROJECT MEMORY:
${existingMemory}

NEW INSIGHTS FROM LATEST REVIEW:
${newScratchpad}

Create a consolidated project memory that:
1. Preserves all important established facts from the existing memory
2. Incorporates new information and corrections from the latest review
3. Removes contradictions (favor newer information)
4. Maintains the same format and structure
5. Is organized and easy to read

Return only the merged project memory, no explanations.`;

    const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      throw new Error(`Fireworks API error: ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || existingMemory;
  } catch (error) {
    console.error('Failed to merge project memory:', error);
    // Fallback: simple concatenation
    return `${existingMemory}\n\n--- UPDATE ---\n\n${newScratchpad}`;
  }
}

// ── Convert review annotations to app annotations ────────────────────

// Map AI markup_type to app annotation type
function mapMarkupType(markupType: string): { type: ToolType; width?: number; height?: number } {
  switch (markupType) {
    case 'cloud':
      return { type: 'cloud', width: 160, height: 60 };
    case 'arrow':
    case 'section_callout_query':
      return { type: 'arrow' };
    case 'rectangle':
    case 'dimension_query':
      return { type: 'rectangle', width: 140, height: 50 };
    case 'highlight':
      return { type: 'highlight' };
    case 'strikeout':
      return { type: 'strikethrough', width: 120 };
    case 'pin_comment':
    case 'missing_info_flag':
    case 'coordination_flag':
    default:
      return { type: 'text' };
  }
}

export function reviewAnnotationsToAppAnnotations(
  reviewAnns: ReviewAnnotation[],
  pageWidth: number,
  pageHeight: number,
): Annotation[] {
  return reviewAnns.map((ra, idx) => {
    // Clamp page_number to valid range (1-based) then convert to 0-based index
    const clampedPage = Math.max(1, Math.min(ra.page_number || 1, 9999));
    const pageIndex = clampedPage - 1;
    const color = SEVERITY_COLORS[ra.severity] || '#3b82f6';

    // Position from normalized coordinates or fallback to staggered placement
    let x = 10;
    let y = 10 + (idx % 15) * 35;
    let x2 = x + 100;
    let y2 = y;
    
    // Only use normalized coordinates if both x1 and y1 are present and valid
    if (ra.coordinates_normalized?.x1 != null && ra.coordinates_normalized?.y1 != null &&
        ra.coordinates_normalized.x1 >= 0 && ra.coordinates_normalized.x1 <= 1 &&
        ra.coordinates_normalized.y1 >= 0 && ra.coordinates_normalized.y1 <= 1) {
      x = ra.coordinates_normalized.x1 * pageWidth;
      y = ra.coordinates_normalized.y1 * pageHeight;
      x2 = (ra.coordinates_normalized?.x2 ?? ra.coordinates_normalized.x1 + 0.15) * pageWidth;
      y2 = (ra.coordinates_normalized?.y2 ?? ra.coordinates_normalized.y1 + 0.05) * pageHeight;
      
      // Debug log for coordinate mapping
      console.log(`Annotation ${ra.annotation_id}: page_number=${ra.page_number}, pageIndex=${pageIndex}, coords=`, {
        x1: ra.coordinates_normalized.x1,
        y1: ra.coordinates_normalized.y1,
        x2: ra.coordinates_normalized.x2,
        y2: ra.coordinates_normalized.y2,
        mapped: { x, y, x2, y2 }
      });
    } else {
      console.warn(`Annotation ${ra.annotation_id} has invalid or missing coordinates, using fallback placement. page_number=${ra.page_number}, coords=`, ra.coordinates_normalized);
    }

    const label = `[${ra.annotation_id}] ${ra.comment_title}`;
    const mapped = mapMarkupType(ra.markup_type);

    // For arrow type, create two points (from → to)
    const points: Point[] = mapped.type === 'arrow'
      ? [{ x, y }, { x: x + 80, y: y - 30 }]
      : [{ x, y }];

    const annotation = {
      id: crypto.randomUUID(),
      type: mapped.type,
      pageIndex,
      points,
      text: label,
      width: mapped.width || (x2 - x > 10 ? x2 - x : undefined),
      height: mapped.height || (y2 - y > 10 ? y2 - y : undefined),
      style: {
        stroke: color,
        strokeWidth: mapped.type === 'cloud' ? 2 : mapped.type === 'strikethrough' ? 2 : 1,
        fill: mapped.type === 'cloud' ? `${color}15` : 'transparent',
        opacity: mapped.type === 'highlight' ? 0.35 : 1,
        fontSize: 10,
        fontFamily: 'Arial',
      },
      createdBy: `plan-review-${ra.source_model || 'ai'}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerOrder: 9000 + idx,
      engineering_justification: ra.engineering_justification,
      cad_directive: ra.cad_directive,
    };
    
    // Debug log for final annotation
    console.log(`Final annotation ${annotation.id}: pageIndex=${annotation.pageIndex}, points=`, annotation.points);
    
    return annotation;
  });
}
