export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key não configurada' });

  try {
    const { prompt } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: 'Responda SOMENTE com JSON válido. Sem texto antes ou depois. Sem markdown. Sem blocos de código.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const texto = data.content[0].text;

    const jsonStr = extrairPrimeiroJSON(texto);
    if (!jsonStr) {
      return res.status(502).json({ error: 'A IA não retornou um JSON reconhecível.' });
    }
    const resultado = JSON.parse(jsonStr);

    return res.status(200).json(resultado);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Extrai o PRIMEIRO objeto JSON completo do texto, contando chaves e
// respeitando strings/escapes. Ignora qualquer coisa antes do "{" inicial
// e depois do "}" que o fecha (markdown, observações que a IA adicione etc.).
function extrairPrimeiroJSON(texto) {
  const ini = texto.indexOf('{');
  if (ini === -1) return null;

  let profundidade = 0;
  let dentroDeString = false;
  let escapando = false;

  for (let i = ini; i < texto.length; i++) {
    const ch = texto[i];

    if (escapando) { escapando = false; continue; }
    if (ch === '\\') { escapando = true; continue; }
    if (ch === '"') { dentroDeString = !dentroDeString; continue; }
    if (dentroDeString) continue;

    if (ch === '{') profundidade++;
    else if (ch === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(ini, i + 1);
    }
  }

  return null; // chave nunca fechou (JSON truncado)
}
