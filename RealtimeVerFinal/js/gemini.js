const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function formatRaceTime(seconds = 0) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${secs}`;
}

export async function getCommentary(apiKey, frameData, horses) {
  if (!apiKey) return null;

  const finishLine = frameData.finishLine ?? 1000;
  const sorted = [...horses].sort((a, b) => b.position - a.position);
  const leader = sorted[0];
  const last = sorted[sorted.length - 1];
  const elapsed = formatRaceTime(frameData.elapsedTime ?? frameData.round ?? 0);

  const horseLines = frameData.moves
    .filter(m => !m.horse.finished || m.moved > 0)
    .map(m => {
      const h = m.horse;
      const status = h.finished
        ? ` 골인! (${formatRaceTime(h.finishTime ?? frameData.elapsedTime)})`
        : ` 현재 ${h.position.toFixed(1)}M`;
      return `- ${h.name}(${h.type.trait}): +${m.moved.toFixed(1)}M${status}`;
    })
    .join('\n');

  const abilityEvents = frameData.abilityEvents || [];
  const abilityLines = abilityEvents.length
    ? '\n특수 능력 발동:\n' + abilityEvents.map(e => `- ${e.icon} ${e.sourceName} - ${e.abilityName}: ${e.message}`).join('\n')
    : '';

  const prompt = `당신은 에너지 넘치는 한국 경마 중계 아나운서입니다. 실시간 경기처럼 박진감 있게 중계해주세요.

[경과 시간 ${elapsed} / 총 ${finishLine}M 레이스]
최근 움직임:
${horseLines}${abilityLines}

선두: ${leader.name} (${leader.position.toFixed(1)}M)
최하위: ${last.name} (${last.position.toFixed(1)}M)

2~3문장으로 극적으로 중계해 주세요. 말의 특성과 발동한 특수 능력을 언급하고, 실시간으로 경기가 흘러가는 느낌을 살려주세요.`;

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
