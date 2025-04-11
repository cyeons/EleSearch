// services/gpt.js
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GPT를 사용해 초등학생이 이해할 수 있도록 요약 생성
 */
async function summarizeContent(originalText) {
  const prompt = `
다음은 어떤 주제에 대한 정보야. 초등학교 4~6학년 학생이 이해할 수 있도록 부드럽고 친절한 말투로 정리해줘 😊

- 중요한 말은 **굵게** 표시해줘.
- 어려운 단어에는 괄호로 설명을 붙여줘.
- 중간중간 이모지(🌍, ⚔️, 💡 등)를 자연스럽게 넣어줘.
- 너무 어려운 내용은 빼줘.
- 문장은 짧고 자연스럽게 단락을 나눠줘.

내용:
${originalText}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 초등학생에게 친절하게 설명해주는 도우미야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ 요약 생성 실패:', err.message);
    return null;
  }
}

/**
 * GPT를 사용해 요약에서 빠진 내용을 중심으로 추천 질문 생성
 */
async function generateFollowupQuestions(originalText, summary) {
  const prompt = `
아래는 어떤 주제에 대한 '본문 전체 내용'과 '요약된 설명'이야.

이 내용을 바탕으로, 초등학생이 더 잘 이해할 수 있도록 궁금해할 만한 추가 질문을 최대 3개개 추천해줘.

- 반드시 본문에 포함된 내용만 사용해줘.
- 요약에서 생략되었거나 축소된 부분이 있다면 그걸 중심으로 질문을 만들어줘.
- 질문은 1문장 이내로 짧고 자연스럽게 써줘.

📘 원문:
${originalText}

📄 요약:
${summary}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 초등학교 학생들에게 정확한 정보를 친절하게 설명하는 선생님이야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5
    });

    return completion.choices[0].message.content.trim().split('\n').filter(Boolean);
  } catch (err) {
    console.error('❌ 질문 생성 실패:', err.message);
    return [];
  }
}

module.exports = {
  summarizeContent,
  generateFollowupQuestions
};
