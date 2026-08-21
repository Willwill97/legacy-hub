const SUPABASE_URL = 'https://hvascsqhwzbacsbdgetu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZxWH8i8BZ19NQfenKFnmcA_JKHU6iO3';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';

    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Sign in to Legacy Hub first.'
      });
    }

    const token = auth.slice(7);

    const verify = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY
      }
    });

    if (!verify.ok) {
      return res.status(401).json({
        error: 'Legacy Hub session could not be verified.'
      });
    }

    const user = await verify.json();

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    const question = String(body.question || '')
      .trim()
      .slice(0, 1200);

    if (!question) {
      return res.status(400).json({
        error: 'Ask Legacy AI a question.'
      });
    }

    const context = body.context || {};
    const history = Array.isArray(body.history)
      ? body.history.slice(-8)
      : [];

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error:
          'Legacy AI is built but OPENAI_API_KEY has not been added to Vercel yet.'
      });
    }

    const instructions = `
You are Legacy AI, the creator coach inside Legacy Hub.

You help TikTok LIVE creators improve consistency, hit monthly LIVE targets,
prepare for battles, and interpret their own Legacy Hub performance data.

Use ONLY the supplied Legacy Hub context for creator-specific facts.
Never invent missing metrics or TikTok data.

The monthly baseline target is:
- 20 LIVE hours
- 8 qualifying LIVE days

Be motivating but practical.
Prefer clear next actions and simple arithmetic.

When useful, mention exact remaining minutes, hours, and days from the context.

Keep normal answers concise.

Do not promise earnings, growth, gifts, rankings, or battle outcomes.

Authenticated Legacy Hub user ID:
${user.id}
`;

    const input = [
      ...history.map(x => ({
        role:
          x.role === 'assistant'
            ? 'assistant'
            : 'user',
        content: String(x.content || '').slice(0, 1800)
      })),

      {
        role: 'user',
        content: `
LEGACY HUB CONTEXT:
${JSON.stringify(context)}

CREATOR QUESTION:
${question}
`
      }
    ];

    const ai = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          model:
            process.env.LEGACY_AI_MODEL ||
            'gpt-5.6-luna',

          instructions,
          input,
          max_output_tokens: 650
        })
      }
    );

    const data = await ai.json();

    if (!ai.ok) {
      console.error(
        'OpenAI API error',
        data
      );

      return res.status(502).json({
        error:
          data?.error?.message ||
          'Legacy AI could not generate a response.'
      });
    }

    const answer =
      data.output_text ||
      (data.output || [])
        .flatMap(o => o.content || [])
        .filter(c => c.type === 'output_text')
        .map(c => c.text)
        .join('\n')
        .trim();

    return res.status(200).json({
      answer:
        answer ||
        'Legacy AI returned an empty response.'
    });
  } catch (err) {
    console.error(
      'Legacy AI endpoint',
      err
    );

    return res.status(500).json({
      error:
        'Legacy AI hit an unexpected error.'
    });
  }
}
