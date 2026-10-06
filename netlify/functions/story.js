// Netlify Function: builds the prompt, calls the LLM, returns a validated story.
// Env vars (Netlify > Site settings > Environment variables): GEMINI_API_KEY, optional GEMINI_MODEL
const SYSTEM = `You write personalised 3-chapter bedtime stories for young children for a parenting brand.
Rules:
- Match vocabulary and sentence length to the age stage given. Age 1: 1-2 tiny sentences per chapter, sounds and repetition. Age 3: short sentences, feelings named simply. Age 5: a small problem and a clever fix. Age 7-8: a real dilemma, the child makes the choice.
- Write in the home language given. If two languages, write in the first and weave in a few simple words of the second.
- The child is the hero. Use the child's name; never assume gender (avoid he/she, use the name or "they").
- Weave in the child's current interests and the life event or topic gently. Use "Parent memories" only if they are clearly relevant; never invent facts about the child that are not given.
- Warm, calm, no scary imagery, no violence, no brand names. Each chapter 50-90 words (age 1: under 25).
- End with one gentle line a parent can say aloud.
Return ONLY JSON: {"title": string, "chapters": [{"title": string, "text": string}, {"title": string, "text": string}, {"title": string, "text": string}], "parentTip": string}`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { error: 'GEMINI_API_KEY is not set on the server' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { profile = {}, topic = '', memories = [] } = body;
  const user = [
    `Child name: ${clip(profile.name, 40)}`,
    `Age stage: ${clip(profile.age, 10)}`,
    `Home languages: ${clip(profile.languages, 60)}`,
    `Interests: ${clip(profile.interests, 120)}`,
    `Topic or situation: ${clip(topic || profile.milestone, 160)}`,
    `Parent memories: ${memories.slice(0, 3).map((m) => '- ' + clip(m, 200)).join('\n') || 'none'}`,
  ].join('\n');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) return json(502, { error: `Model request failed (${r.status})` });
    const data = await r.json();
    const story = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    if (!Array.isArray(story.chapters) || story.chapters.length !== 3) return json(502, { error: 'Model returned an unexpected shape' });
    return json(200, story);
  } catch (e) {
    return json(502, { error: 'Could not generate a story' });
  }
};
const clip = (s, n) => String(s || '').slice(0, n);
const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
