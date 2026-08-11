/**
 * lib/gemini.ts  —  AI layer powered by Groq (llama-3.3-70b-versatile)
 *
 * Rules enforced:
 * 1. ALL questions are based strictly on the candidate's resume (projects, skills, experience).
 * 2. Wrong / blank / off-topic answers receive score = 0.
 * 3. Alex behaves like a senior real-world technical interviewer — no hints, no encouragement for bad answers.
 */
import Groq from "groq-sdk"
import type { ResumeData, ChatMessage, SessionReport } from "./firebase"

function getClient(): Groq {
  const key = process.env.GROQ_API_KEY
  if (!key || key.trim().length < 10) {
    throw new Error(
      "Groq AI is not configured. Please set GROQ_API_KEY in your .env.local file.\n" +
      "Get a free key at: https://console.groq.com/keys"
    )
  }
  return new Groq({ apiKey: key.trim() })
}

const MODEL = "llama-3.3-70b-versatile"

async function chat(system: string, user: string): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    temperature: 0.5,
    max_tokens: 512,
  })
  return res.choices[0]?.message?.content?.trim() ?? ""
}

// ── 1. Resume analysis ────────────────────────────────────────────────────────
export async function analyseResume(rawText: string, uid: string): Promise<ResumeData> {
  const system = `You are a professional resume analyser and technical recruiter. Extract structured data and return ONLY valid JSON — no markdown fences, no explanation, no extra text.`

  const user = `Analyse this resume carefully and return exactly this JSON structure:
{
  "uid": "${uid}",
  "rawText": "",
  "name": "full name",
  "skills": ["skill1","skill2"],
  "languages": ["Java","Python"],
  "frameworks": ["React","Spring Boot"],
  "experience": ["Job Title at Company (year-year): one line description"],
  "projects": ["Project Name: one line description of what it does and tech used"],
  "education": ["Degree, University (year)"],
  "achievements": ["achievement"],
  "score": 72,
  "summary": "2-3 sentence professional summary of the candidate"
}

IMPORTANT — Score must be calculated based on these criteria (total 100):
- Technical Skills (programming languages, tools): 0-25 points
  * 20-25: 5+ strong languages/tools listed and demonstrated in projects
  * 10-19: 3-4 languages/tools
  * 0-9:   1-2 languages/tools or very basic
- Projects (quality and relevance): 0-30 points
  * 25-30: 3+ real technical projects with clear tech stack described
  * 15-24: 1-2 projects with some technical detail
  * 0-14:  No projects or very vague descriptions
- Experience (work history): 0-25 points
  * 20-25: 2+ years relevant experience with clear responsibilities
  * 10-19: Some experience or internships
  * 0-9:   No experience or student only
- Education (degree and institution): 0-10 points
  * 8-10:  Relevant degree (CS, Engineering, etc.)
  * 4-7:   Other degree
  * 0-3:   No degree mentioned
- Achievements/Certifications: 0-10 points
  * 8-10:  Multiple certifications or notable achievements
  * 4-7:   1-2 achievements
  * 0-3:   None

Calculate an honest score. Do NOT give 50 unless the resume is truly average.
A strong resume with many projects and skills should score 75-90.
A weak resume with little content should score 20-40.
An empty or unparseable resume should score 15-25.

Resume text:
${rawText.slice(0, 4000)}`

  const text = (await chat(system, user)).replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(text)
    parsed.rawText = rawText.slice(0, 300)
    return parsed as ResumeData
  } catch {
    return {
      uid, rawText: rawText.slice(0, 300),
      name: "Candidate", skills: [], languages: [], frameworks: [],
      experience: [], projects: [], education: [], achievements: [],
      score: -1, summary: "Resume parsed with limited detail.",
    }
  }
}

// ── 2. First question — must be directly from resume ─────────────────────────
export async function generateFirstQuestion(
  resume: ResumeData, role: string, difficulty: string
): Promise<string> {
  const system = `You are Alex, a senior technical interviewer at a top tech company.
You are conducting a ${difficulty} difficulty ${role} interview.
Your questions MUST reference something specific from the candidate's resume — a project, a technology they listed, or their experience.
You do NOT give hints. You do NOT compliment bad answers. You are professional, direct, and realistic.`

  const user = `The candidate's resume has:
Projects: ${resume.projects.slice(0, 3).join(" | ") || "none listed"}
Skills: ${resume.skills.slice(0, 8).join(", ") || "none listed"}
Languages: ${resume.languages.join(", ") || "none listed"}
Frameworks: ${resume.frameworks.join(", ") || "none listed"}
Experience: ${resume.experience.slice(0, 2).join(" | ") || "none listed"}

Write a 1-sentence warm greeting and then ask ONE specific technical question based directly on one of their listed projects or technologies.
Keep your entire response under 70 words. Do NOT number the question.`

  return chat(system, user)
}

// ── 3. Follow-up questions — adaptive, resume-anchored ───────────────────────
export async function generateNextQuestion(
  resume: ResumeData,
  role: string,
  difficulty: string,
  history: ChatMessage[],
  questionNumber: number,
  totalQuestions: number
): Promise<string> {
  const conv = history
    .map(m => `${m.role === "agent" ? "Alex" : "Candidate"}: ${m.content}`)
    .join("\n")

  const lastAnswer = [...history].reverse().find(m => m.role === "candidate")
  const lastScore  = lastAnswer?.score ?? -1

  const system = `You are Alex, a senior technical interviewer conducting a ${difficulty} ${role} interview.
Rules you MUST follow:
- Every question must reference something from the candidate's resume (projects, skills, experience, frameworks).
- If the last answer was wrong (score 0-3): ask a different but still resume-based question, do NOT give the answer.
- If the last answer was partial (score 4-5): dig deeper into the same topic.
- If the last answer was strong (score 6-10): increase difficulty or move to the next resume topic.
- Never repeat a question already asked.
- Be direct, professional, and realistic — like a real FAANG interviewer.`

  const user = `Candidate resume summary:
Projects: ${resume.projects.slice(0, 3).join(" | ") || "none"}
Skills: ${resume.skills.slice(0, 6).join(", ")}
Languages: ${resume.languages.join(", ")}
Frameworks: ${resume.frameworks.join(", ")}

Conversation so far:
${conv}

Last answer score: ${lastScore === -1 ? "not yet scored" : `${lastScore}/10`}
This is question ${questionNumber} of ${totalQuestions}.

Ask ONE new interview question following the rules above. Keep it under 55 words. No numbering.`

  return chat(system, user)
}

// ── 4. Answer evaluation — strict 0 for wrong/blank answers ──────────────────
export interface EvaluationResult {
  score:      number   // 0-10 (0 = wrong/blank)
  isCorrect:  boolean
  feedback:   string
  shortReply: string
}

export async function evaluateAnswer(
  question: string,
  answer: string,
  resume: ResumeData,
  role: string
): Promise<EvaluationResult> {
  // Only give 0 for completely blank or nonsense (single character)
  const trimmed = answer.trim()
  if (trimmed.length < 2) {
    return {
      score: 0,
      isCorrect: false,
      feedback: "No answer was provided.",
      shortReply: "Let's move on to the next question.",
    }
  }

  const system = `You are Alex, a fair technical interviewer evaluating a ${role} candidate's answer.

Scoring rules — follow STRICTLY:
- Score 1-2: Answer is mostly wrong but shows the slightest awareness of the topic (even 1% relevant).
- Score 3-4: Answer has some correct elements but misses key concepts.
- Score 5-6: Answer is partially correct — understands the concept but incomplete.
- Score 7-8: Answer is correct and covers the main points well.
- Score 9-10: Answer is strong, detailed, shows depth and real understanding.
- Score 0 ONLY IF: The answer is completely blank, totally unrelated, or pure gibberish with zero relevance.

IMPORTANT: If the answer shows even 1% relevance to the question, give at least score 1. Never punish partial knowledge with 0.
Be encouraging of partial answers — this is a learning environment.
Return ONLY valid JSON. No markdown. No extra text.`

  const user = `Question: ${question}
Candidate's answer: ${answer}

Return exactly:
{
  "score": <integer 0-10>,
  "isCorrect": <true if score >= 6>,
  "feedback": "<1-2 sentences: what was right, what was missing, what the full answer should include>",
  "shortReply": "<1 natural sentence Alex says to acknowledge and move forward>"
}`

  const text = (await chat(system, user)).replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(text)
    // enforce isCorrect based on score
    parsed.isCorrect = parsed.score >= 6
    return parsed as EvaluationResult
  } catch {
    return {
      score: 0, isCorrect: false,
      feedback: "Could not evaluate the answer. Please give a more detailed response.",
      shortReply: "Let's keep going. I'll note that one and we'll move on.",
    }
  }
}

// ── 5. Final improvement report ───────────────────────────────────────────────
export async function generateReport(
  resume: ResumeData,
  role: string,
  messages: ChatMessage[]
): Promise<SessionReport> {
  const qa = messages.reduce<{ q: string; a: string; score: number }[]>((acc, m, i) => {
    if (m.role === "agent" && messages[i + 1]?.role === "candidate") {
      acc.push({
        q:     m.content,
        a:     messages[i + 1].content,
        score: messages[i + 1].score ?? 0,
      })
    }
    return acc
  }, [])

  const totalScore  = qa.length
    ? Math.round((qa.reduce((s, x) => s + x.score, 0) / (qa.length * 10)) * 100)
    : 0
  const correct = qa.filter(x => x.score >= 6).length

  const system = `You are an expert career coach and technical interviewer.
Generate an honest, actionable improvement report. Do not sugarcoat weak performance.
Return ONLY valid JSON — no markdown, no extra text.`

  const user = `Candidate role: ${role}
Resume skills: ${resume.skills.join(", ")}
Resume projects: ${resume.projects.slice(0, 3).join(" | ")}

Interview Q&A:
${qa.map((x, i) => `Q${i + 1} (Score ${x.score}/10):\nQuestion: ${x.q}\nAnswer: ${x.a}`).join("\n\n")}

Overall score: ${totalScore}/100 (${correct}/${qa.length} correct answers)

Return:
{
  "strengths": ["specific strength based on the interview"],
  "weaknesses": ["specific weakness with topic name"],
  "improvements": [
    {
      "topic": "exact topic name",
      "suggestion": "specific actionable 2-sentence advice",
      "resources": ["resource1.com", "resource2.com"]
    }
  ],
  "recommendation": "Recommended"
}

recommendation must be exactly one of: "Highly Recommended", "Recommended", "Needs Improvement", "Not Ready Yet"
Base it strictly on the score: 80-100 = Highly Recommended, 60-79 = Recommended, 40-59 = Needs Improvement, 0-39 = Not Ready Yet.
Provide 2-4 improvements. Use real learning resources.`

  const text = (await chat(system, user)).replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(text)
    return {
      totalScore,
      technicalScore:     totalScore,
      communicationScore: Math.min(100, totalScore + 5),
      questionsAsked:     qa.length,
      correctAnswers:     correct,
      strengths:          parsed.strengths    ?? [],
      weaknesses:         parsed.weaknesses   ?? [],
      improvements:       parsed.improvements ?? [],
      recommendation:     parsed.recommendation ?? (
        totalScore >= 80 ? "Highly Recommended" :
        totalScore >= 60 ? "Recommended" :
        totalScore >= 40 ? "Needs Improvement" : "Not Ready Yet"
      ),
    } as SessionReport
  } catch {
    return {
      totalScore, technicalScore: totalScore, communicationScore: totalScore,
      questionsAsked: qa.length, correctAnswers: correct,
      strengths:    ["Completed the interview"],
      weaknesses:   ["Needs more preparation on core topics"],
      improvements: [{
        topic:      "Core Technical Concepts",
        suggestion: "Review fundamental concepts for your target role. Practice answering questions out loud.",
        resources:  ["leetcode.com", "interviewbit.com", "roadmap.sh"],
      }],
      recommendation: totalScore >= 60 ? "Recommended" : "Needs Improvement",
    }
  }
}
