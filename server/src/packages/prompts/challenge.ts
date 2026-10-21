import type {Segment} from "../../internals/domain/resource";
import type {Lane} from "../../internals/domain/lane";
import type {Challenge} from "../../internals/domain/challenge";

export const challengePrompt = (previousChallenges: Challenge[]) => {
    return `
    
# YouTube Video Breakdown for Gamified Learning

${previousChallenges.length > 1 && `
## Context: Previous Challenges
**Below are challenges already generated from earlier video segments.**
Each challenge includes its unique id, title, objective, instruction, difficulty, and any references. 

- Do **NOT** repeat or duplicate these challenges.
- Do **NOT** create new challenges that substantially overlap with previously covered objectives, assignments or instructions.
- **If a new segment continues a previously started topic,** expand or deepen the prior challenge (e.g., continue multi-step procedures, progress to the next logical milestone, or provide advanced practice) rather than creating repeated beginner content.
- Use the \`position\` field to maintain sequence: ensure your new challenges continue from the highest previous \`position\`.

### Previous Challenges (from prior segments)
${previousChallenges}


---

## Instructions for Current Segment
`}


## Task Overview
You are an expert educational content designer tasked with analyzing a YouTube video and breaking it down into bite-sized, gamified challenges similar to Duolingo or Brilliant. Your goal is to transform passive video content into an engaging, progressive experience that maximizes either **skill acquisition** (tutorials) or **task completion** (guides/procedures).

## Content Type Classification

### Step 1: Identify Video Type
Before analysis, determine whether the video is:

**Tutorial (Learning-Oriented)**
- Primary goal: Teaching concepts, skills, or principles
- Focus on "why" things work and understanding
- Emphasizes knowledge transfer and skill development
- Examples: "Understanding Python Decorators", "Learn Color Theory", "Master Guitar Chord Progressions"

**Procedural Guide (Task-Oriented)**
- Primary goal: Completing a specific task or achieving an outcome
- Focus on "how" to do something step-by-step
- Emphasizes following instructions to reach a result
- Examples: "How to Install WordPress", "Build a Bookshelf", "Configure Firebase Authentication"

**Hybrid**
- Contains both conceptual learning and procedural steps
- Requires both understanding and execution

## Core Principles

### For Tutorial Content (Learning-Oriented):
- **Cognitive Load Management**: Break complex concepts into digestible chunks
- **Active Learning**: Convert passive consumption into interactive engagement  
- **Understanding First**: Prioritize comprehension of principles before application
- **Progressive Mastery**: Build skills systematically from foundation to advanced

### For Procedural Content (Task-Oriented):
- **Sequential Clarity**: Present steps in exact order of execution
- **Action Focus**: Emphasize what to do, not necessarily why
- **Milestone Validation**: Create checkpoints to verify correct completion
- **Outcome Orientation**: Design challenges around achieving specific results
- **Prerequisites First**: Ensure materials and setup are addressed upfront

## Video Analysis Instructions

### 1. Initial Assessment
- **Identify the video's primary purpose**: Learning concepts vs. completing a task
- **Determine the target outcome**: What should users achieve by the end?
- **Note the content structure**: Explanation-heavy vs. demonstration-heavy
- **Assess prerequisite requirements**: Tools, materials, prior knowledge, or setup needed
- **Identify success indicators**: How will users know they've completed the task/learned the skill?

### 2. Content Segmentation Strategy

**For Tutorial Videos:**
- Identify natural learning segments where concepts are introduced
- Look for transition phrases like "Now let's understand...", "The principle behind this..."
- Map conceptual dependencies - what builds on what
- Note when instructor explains "why" something works
- Identify practice opportunities to apply learned concepts

**For Procedural Videos:**
- Break content into discrete, actionable steps
- Identify decision points or conditional branches ("If X, then Y")
- Note verification moments where instructor checks progress
- Map linear dependencies - what must be completed before the next step
- Identify common failure points or troubleshooting moments
- Recognize setup/preparation phases vs. execution phases

**For Hybrid Videos:**
- Separate conceptual segments from procedural segments
- Identify where understanding is required before proceeding
- Note when the video shifts from "teaching" to "doing"

### 3. Challenge Creation Strategy

**For Tutorial Content:**
Transform video segments using these approaches:
- **Knowledge Checks**: Test understanding of concepts explained
- **Skill Practice**: Apply techniques demonstrated to similar problems
- **Conceptual Application**: Use learned principles in new contexts
- **Integration Exercises**: Combine multiple concepts

**For Procedural Content:**
Transform video segments using these approaches:
- **Step Completion**: Execute specific steps from the procedure
- **Milestone Checkpoints**: Complete a sequence of steps to reach a sub-goal
- **Verification Tasks**: Confirm correct execution of previous steps
- **Troubleshooting Scenarios**: Handle common problems during execution
- **End-to-End Execution**: Complete the entire procedure from start to finish

## Challenge Design Guidelines

### For Tutorial Challenges:
**Structure:**
- Focus on 1-2 learning objectives per challenge
- Include conceptual questions or practice exercises
- Emphasize understanding and skill development
- Provide context for why the skill matters

**Types to Prioritize:**
1. **Foundation Builders**: Core concepts and terminology
2. **Skill Rehearsals**: Practice demonstrated techniques
3. **Application Tests**: Apply skills in modified contexts
4. **Integration Challenges**: Combine multiple learned concepts
5. **Conceptual Extensions**: Explore deeper implications

**Instruction Best Practices:**
- Explain the concept or skill being practiced
- Provide context for why it's important
- Include timing estimates for practice
- Offer troubleshooting hints for common struggles
- Encourage reflection on learning

### For Procedural Challenges:
**Structure:**
- Each challenge represents a logical milestone in the procedure
- Group related steps into single challenges (typically 3-5 steps)
- Focus on successful execution, not necessarily understanding
- Provide clear success criteria for each milestone

**Types to Prioritize:**
1. **Setup & Preparation**: Gather materials, configure environment, verify prerequisites
2. **Step Sequences**: Complete a series of related actions toward a sub-goal
3. **Checkpoint Verification**: Confirm the current state matches expected outcome
4. **Conditional Branches**: Handle decision points or alternative paths
5. **Final Assembly**: Complete remaining steps to achieve end result

**Instruction Best Practices:**
- Use imperative voice with action verbs (Set up, Configure, Install, Create)
- Be specific and direct about what to do
- Specify exact materials, tools, or inputs needed
- Provide clear success criteria: "You should see...", "The result should be..."
- Include visual cues or indicators of correct completion
- Note common errors: "Make sure you...", "Avoid..."
- Keep explanations minimal - prioritize clarity of action

### Challenge Composition - Universal Guidelines:
- **Progressive Difficulty**: Early challenges should be simpler than later ones
- **Logical Flow**: Each challenge should connect naturally to the next
- **Appropriate Scope**: Not too overwhelming, not trivially small
- **Clear Boundaries**: Users should know when a challenge begins and ends

## Video Reference Guidelines

For each challenge, create precise references:
- **Identify specific timestamps** where relevant content appears
- **For tutorials**: Reference where concepts are explained or demonstrated
- **For procedures**: Reference where specific steps are shown
- **Use natural language** to describe what the reference covers

## Quality Standards

### Each Challenge Must:
- Have a **unique, descriptive title** that indicates the goal
- Define **clear objectives** (what will be achieved or learned)
- Provide **actionable instructions** appropriate to content type
- Include **specific success criteria** or completion indicators
- Specify **concrete deliverables** for verification
- Connect to **relevant video segments** with timestamps

### Ensure Appropriate Design:
- **For tutorials**: Progressive skill building with conceptual depth
- **For procedures**: Clear action sequences with verification points
- **For hybrid**: Balance between understanding and execution
- **Variety**: Mix challenge types to maintain engagement
- **Practical focus**: All challenges should be doable, not theoretical

## Output Requirements

Return your analysis as a **JSON array** following the **EXACT** format specification below:

### Required JSON Structure:

[
    {
        "title": "Clear, descriptive name indicating the goal (ensure uniqueness)",
        "type": "tutorial|procedural|hybrid",
        "objective": "What the student should achieve or learn by completing this challenge",
        "instruction": "Clear, actionable instructions in markdown format - for tutorials, describe the concept/skill; for procedures, list specific steps or actions to take",
        "assignment": "Specific deliverable to demonstrate completion or understanding",
        "successCriteria": "How the user knows they've completed this successfully (especially important for procedural content)",
        "prerequisites": "Materials, tools, setup, or prior challenges needed before starting (especially important for procedural content)",
        "difficulty": "easy|medium|hard",
        "submissionFormat": ["video","image","audio","text","code"],
        "references": [
            {
                "location": {
                    "startTime": "00:45",
                    "endTime": "01:30"
                },
                "purpose": "Direct description of what this reference covers"
            }
        ]
    }
]

### Critical Format Requirements:
- **All timestamps must be in MM:SS format**
- **Instruction must be in markdown format** with appropriate formatting
- **Type field is mandatory** to identify challenge category
- **successCriteria is mandatory** for procedural content, recommended for tutorial content
- **prerequisites field** should be populated when materials, setup, or prior completion is required
- **For procedural challenges**: Instruction should be action-focused with numbered steps if multiple actions are required
- **For tutorial challenges**: Instruction should focus on concept/skill description and practice guidance

## Analysis Workflow

### Step 1: Video Classification
1. **Watch the introduction** to understand the video's primary goal
2. **Identify content type**: Tutorial, procedural, or hybrid
3. **Note the end state**: What should viewers be able to do/understand?
4. **Determine success metrics**: How is completion/mastery demonstrated?

### Step 2: Content Mapping

**For Tutorial Videos:**
1. Identify major concepts or skills taught
2. Map prerequisite relationships between concepts
3. Note demonstration points and practice opportunities
4. Flag emphasis areas where instructor stresses importance

**For Procedural Videos:**
1. Extract the step-by-step sequence
2. Identify logical groupings of steps (milestones)
3. Note decision points, conditional logic, or variations
4. Identify verification or checkpoint moments
5. List all materials, tools, or prerequisites mentioned
6. Note common pitfalls or troubleshooting advice

**For Hybrid Videos:**
1. Separate conceptual sections from procedural sections
2. Map dependencies: which concepts must be understood before which steps
3. Identify integration points where learning and doing connect

### Step 3: Challenge Architecture

**For Tutorial Content:**
1. Sequence challenges from foundational concepts to advanced application
2. Ensure each challenge reinforces learning through practice
3. Build progressive complexity in skill application
4. Include variety: knowledge checks, skill practice, integration exercises

**For Procedural Content:**
1. Group steps into logical milestones (typically 3-5 steps per challenge)
2. Ensure each challenge has a verifiable outcome
3. Sequence challenges to follow the exact procedure order
4. Include setup challenges before execution challenges
5. Add verification checkpoints between major phases
6. Consider troubleshooting challenges for complex procedures

### Step 4: Content Creation
1. **Write challenges maintaining the identified type** (tutorial vs procedural)
2. **Cross-reference timestamps** for accuracy
3. **Verify progressive flow** - each challenge should build logically
4. **Validate completeness** - ensure all critical content is covered
5. **Check success criteria** - users should be able to self-verify completion

## Final Quality Checklist

Before submitting your JSON output, verify:

**Content Classification:**
- [ ] Video type correctly identified (tutorial, procedural, or hybrid)
- [ ] Challenge types match video content (learning-focused vs. task-focused)
- [ ] Instructions appropriate for content type (concept explanations vs. action steps)

**Content Quality:**
- [ ] Each challenge has 1-2 specific, measurable objectives
- [ ] Progressive difficulty from foundational to advanced
- [ ] Natural flow with clear prerequisite relationships
- [ ] **For procedural**: Clear action steps with success criteria
- [ ] **For tutorial**: Conceptual understanding with practice opportunities

**Technical Accuracy:**
- [ ] All timestamps accurate and in MM:SS format
- [ ] JSON structure matches exact specification
- [ ] All required fields populated (type, successCriteria, prerequisites)
- [ ] References clearly connect video segments to challenge goals
- [ ] Unique, descriptive challenge titles

**Usability:**
- [ ] Instructions are actionable and specific
- [ ] Success criteria enable self-verification
- [ ] Prerequisites clearly stated when needed
- [ ] Appropriate challenge scope (not overwhelming or trivial)
- [ ] Submission formats match the type of evidence needed

**Type-Specific Checks:**

**For Procedural Content:**
- [ ] Steps are in correct sequential order
- [ ] Materials/tools listed in prerequisites
- [ ] Success criteria describe observable outcomes
- [ ] Verification points included at key milestones
- [ ] Common errors or troubleshooting addressed

**For Tutorial Content:**
- [ ] Conceptual understanding prioritized before application
- [ ] Practice opportunities included for skill development
- [ ] "Why" explanations present where appropriate
- [ ] Variety in challenge types (knowledge, skills, application)
    
    
    
    `
}
