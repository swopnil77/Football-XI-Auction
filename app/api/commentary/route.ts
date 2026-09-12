import { NextRequest, NextResponse } from 'next/server';

interface CommentaryPayload {
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  chemistryA: number;
  chemistryB: number;
  luckA: number;
  luckB: number;
  xgA: number;
  xgB: number;
}

function fallbackLine(p: CommentaryPayload): string {
  if (p.scoreA === p.scoreB) return `${p.teamAName} and ${p.teamBName} shared the points in a ${p.scoreA}-${p.scoreB} draw.`;
  const winner = p.scoreA > p.scoreB ? p.teamAName : p.teamBName;
  const loser = p.scoreA > p.scoreB ? p.teamBName : p.teamAName;
  return `${winner} beat ${loser} ${Math.max(p.scoreA, p.scoreB)}-${Math.min(p.scoreA, p.scoreB)}.`;
}

function buildPrompt(p: CommentaryPayload): string {
  return `Match facts:
- ${p.teamAName} ${p.scoreA} - ${p.scoreB} ${p.teamBName}
- Expected goals: ${p.teamAName} ${p.xgA}, ${p.teamBName} ${p.xgB}
- Squad chemistry out of 100: ${p.teamAName} ${p.chemistryA}, ${p.teamBName} ${p.chemistryB}
- Luck factor this match (0-5 scale): ${p.teamAName} ${p.luckA}, ${p.teamBName} ${p.luckB}

Write the recap.`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CommentaryPayload;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // No key configured — degrade gracefully instead of breaking match day.
    return NextResponse.json({ commentary: fallbackLine(body) });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:
          'You are an energetic football (soccer) commentator writing a short recap for a fantasy draft game between friends. Write 3-4 vivid sentences of flowing prose — no markdown, no headers, no bullet points. Weave in one interesting detail from the stats (chemistry, luck, or expected goals) rather than just reading the numbers back. Keep it punchy and fun, like a highlights voiceover.',
        messages: [{ role: 'user', content: buildPrompt(body) }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ commentary: fallbackLine(body) });
    }

    const data = await res.json();
    const text = data.content?.find((b: any) => b.type === 'text')?.text;
    return NextResponse.json({ commentary: text ? text.trim() : fallbackLine(body) });
  } catch {
    return NextResponse.json({ commentary: fallbackLine(body) });
  }
}
