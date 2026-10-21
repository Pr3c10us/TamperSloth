const FeedbackFactPrompt = `
Please extract a single feedback fact from user submission evaluation data. The input will be a string in the format: "title: [title] | objective: [objective] | feedback: [feedback] | pass: [true/false] | timestamp: [human-readable timestamp]"

Here are some few shot examples:

Input: "title: Basic Skateboard Mounting | objective: Learn proper foot placement and mounting technique | feedback: Your foot placement was incorrect - you placed your front foot on the tail instead of your back foot. This makes it difficult to maintain balance when mounting. | pass: false | timestamp: 4th October 2025 at 14:30"
Output: {"facts": ["Failed Basic Skateboard Mounting (4th October 2025 at 14:30): when trying to learn proper foot placement and mounting technique, user placed their front foot on the tail instead of their back foot, making it difficult to maintain balance"]}

Input: "title: Advanced JavaScript Promises | objective: Master asynchronous programming with Promise chains | feedback: Excellent work! Your Promise chains are properly structured and error handling is implemented correctly. To take it further, consider using async/await syntax for cleaner, more readable code in complex scenarios. | pass: true | timestamp: 4th October 2025 at 15:45"
Output: {"facts": ["Passed Advanced JavaScript Promises (4th October 2025 at 15:45): successfully mastered asynchronous programming with Promise chains. Can improve by using async/await syntax for cleaner, more readable code in complex scenarios"]}

Input: "title: Photosynthesis Fundamentals | objective: Understand the basic process of photosynthesis in plants | feedback: Your diagram shows good understanding of the basic process. However, you missed labeling the ATP molecules in the light-dependent reactions. Make sure to review the energy conversion steps more carefully. | pass: false | timestamp: 7th July 2024 at 11:57"
Output: {"facts": ["Failed Photosynthesis Fundamentals (7th July 2024 at 11:57): when trying to understand the basic process of photosynthesis in plants, user missed labeling ATP molecules in the light-dependent reactions and needs to review energy conversion steps more carefully"]}

Input: "title: Watercolor Wet-on-Wet Technique | objective: Master basic wet-on-wet watercolor painting method | feedback: Great job! You've demonstrated good control over the wet-on-wet technique and your color transitions are smooth. For even better results, try varying the water-to-paint ratio more to create different opacity effects. | pass: true | timestamp: 15th March 2025 at 09:20"
Output: {"facts": ["Passed Watercolor Wet-on-Wet Technique (15th March 2025 at 09:20): successfully mastered basic wet-on-wet watercolor painting method. Can improve by varying the water-to-paint ratio more to create different opacity effects"]}

Input: "title: Guitar Chord Transitions | objective: Develop smooth transitions between basic chords | feedback: You're rushing the chord changes, which causes buzzing on the strings. Slow down your tempo and focus on clean finger placement before increasing speed. | pass: false | timestamp: 22nd August 2024 at 16:05"
Output: {"facts": ["Failed Guitar Chord Transitions (22nd August 2024 at 16:05): when trying to develop smooth transitions between basic chords, user rushed the chord changes causing string buzzing and needs to slow down tempo and focus on clean finger placement before increasing speed"]}

Input: "title: SQL JOIN Operations | objective: Write complex queries using multiple JOIN types | feedback: Perfect execution! All JOIN types were used correctly and your query optimization is solid. | pass: true | timestamp: 1st January 2025 at 13:10"
Output: {"facts": ["Passed SQL JOIN Operations (1st January 2025 at 13:10): successfully wrote complex queries using multiple JOIN types with correct execution and solid query optimization"]}

Format:
- Failed attempts: "Failed [title] ([timestamp]): when trying to [objective], user [specific reason from feedback] and needs to [improvement guidance from feedback]"
- Passed attempts without improvement tips: "Passed [title] ([timestamp]): successfully [objective achievement summary from feedback]"
- Passed attempts with improvement tips: "Passed [title] ([timestamp]): successfully [objective achievement summary]. Can improve by [actionable suggestion from feedback]"

Return a single fact wrapped in an array in JSON format as shown above with key "facts".
`

export default FeedbackFactPrompt

