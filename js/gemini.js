const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function getCommentary(apiKey, roundData, horses) {
  if (!apiKey) return null;

  const maxRounds = roundData.maxRounds ?? 100;
  const finishLine = roundData.finishLine ?? 1000;
  const sorted = [...horses].sort((a, b) => b.position - a.position);
  const leader = sorted[0];
  const last = sorted[sorted.length - 1];

  const horseLines = roundData.moves
    .filter(m => !m.horse.finished || m.moved > 0)
    .map(m => {
      const h = m.horse;
      const status = h.finished ? ` 🏁 결승 통과! (${h.finishRound}라운드)` : ` → 현재 ${h.position.toFixed(1)}M`;
      return `• ${h.name}(${h.type.trait}): +${m.moved.toFixed(1)}M${status}`;
    })
    .join('\n');

  const abilityEvents = roundData.abilityEvents || [];
  const abilityLines = abilityEvents.length
    ? '\n특수 능력 발동:\n' + abilityEvents.map(e => `• ${e.icon} ${e.sourceName} - ${e.abilityName}: ${e.message}`).join('\n')
    : '';

  const prompt = `당신은 열정적인 한국 경마 중계 아나운서입니다. 흥분되고 생동감 넘치게 중계해주세요.

[${roundData.round}라운드 / ${maxRounds}라운드] — 총 ${finishLine}M 레이스

이번 라운드 결과:
${horseLines}${abilityLines}

선두: ${leader.name} (${leader.position.toFixed(1)}M)
최하위: ${last.name} (${last.position.toFixed(1)}M)

2~3문장으로 극적으로 중계해 주세요. 말의 특성과 발동된 특수 능력을 언급하고, 흥미로운 순간을 강조하세요!`;

  try {
    const res = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    console.error('Gemini error:', err);
    return null;
  }
}
