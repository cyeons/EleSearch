router.post('/', async (req, res) => {
  const totalStart = Date.now();

  const { context, question } = req.body;

  console.log('\n🟡 [QUESTION START]');
  console.log('📝 질문:', question);
  console.log('📚 context 길이:', context?.length);
  console.log('📘 context 미리보기:', context?.slice(0, 150));

  if (!context || !question) {
    console.warn('⚠️ 질문 또는 context 누락');
    return res.status(400).json({ message: '질문과 문맥(context)이 필요합니다.' });
  }

  const prompt = `
아래 문맥은 어떤 주제에 대한 설명이야.
이 내용을 바탕으로 사용자가 한 질문에 대해 부드럽고 친절하게 답변해줘. 🧒

- 반드시 문맥 안에 있는 정보만 바탕으로 설명해줘.
- 어려운 용어는 괄호로 풀어줘.
- 이모지를 적절히 넣고, 말투는 따뜻하고 쉽게 말해줘.
- 문장은 짧고 자연스럽게 단락을 나눠줘.

📘 문맥:
${context}

❓ 질문:
${question}
  `;

  try {
    console.time('🧠 GPT 응답 시간');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 어린이의 궁금증을 쉽게 설명해주는 선생님이야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5
    });

    console.timeEnd('🧠 GPT 응답 시간');

    const answer = completion.choices[0].message.content.trim();
    console.log('✅ GPT 응답 완료');

    const totalDuration = Date.now() - totalStart;
    console.log(`✅ 질문 응답 완료 → 총 소요 시간: ${totalDuration}ms`);

    res.json({ answer });
  } catch (error) {
    console.error('❌ 질문 응답 실패:', error.message);
    res.status(500).json({ message: '질문 응답 중 오류가 발생했습니다.', error: error.message });
  }
});
