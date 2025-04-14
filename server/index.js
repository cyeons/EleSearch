app.post('/search', searchLimiter, async (req, res) => {
  const totalStart = Date.now();
  console.log(`\n🟡 [SEARCH START] "${req.body.keyword}"`);

  const timeMark = (label) => {
    const now = Date.now();
    const ms = now - totalStart;
    console.log(`⏱️ ${label}: +${ms}ms`);
  };

  const { keyword: userQuery } = req.body;
  const userId = req.headers['x-user-id'] || 'unknown';
  const userIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  timeMark('🔸 요청 수신');

  // 입력 검증
  if (!userQuery?.trim()) return res.status(400).json({ message: '검색어를 입력해주세요.' });
  if (!isValidKeyword(userQuery)) return res.status(400).json({ message: '검색어가 올바르지 않아요. 다시 입력해 주세요.' });
  if (containsBlockedWord(userQuery)) return res.status(403).json({ message: '이런 표현은 사용할 수 없어요. 다시 입력해주세요.' });
  if (isOverDailyLimit(userId)) return res.status(429).json({ message: '오늘은 더 이상 검색할 수 없어요. 내일 다시 시도해 주세요.' });

  timeMark('🔸 입력 검증 통과');

  // 1단계: GPT 키워드 추출
  let keyword = userQuery.trim();
  try {
    const extractPrompt = `다음 문장에서 핵심 키워드 하나만 뽑아줘. 문장: "${userQuery}"`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 문장에서 핵심 키워드 하나만 뽑아주는 도우미야.' },
        { role: 'user', content: extractPrompt }
      ],
      temperature: 0.3
    });
    keyword = completion.choices[0].message.content.trim();
    console.log(`🔑 추출된 키워드: ${keyword}`);
  } catch (err) {
    console.warn('⚠️ 키워드 추출 실패:', err.message);
  }

  timeMark('🔸 키워드 추출 완료');

  // 2~4단계: 위키 → 영어 위키 → Serper 검색
  let success = false;
  let source = '';
  let originalText = '';
  let summary = '';
  let questions = [];

  try {
    console.log('🌐 한국어 위키 검색 시도');
    const response = await axios.get(`https://ko.wikipedia.org/wiki/${encodeURIComponent(keyword)}`);
    const $ = cheerio.load(response.data);
    const content = $('#mw-content-text .mw-parser-output p').text().trim();
    originalText = content;
    source = '한국어 위키피디아';
    success = true;
  } catch (err) {
    console.warn('⚠️ 한국어 위키 실패:', err.message);
  }

  if (!success) {
    try {
      console.log('🌐 영어 위키 검색 시도');
      const response = await axios.get(`https://en.wikipedia.org/wiki/${encodeURIComponent(keyword)}`);
      const $ = cheerio.load(response.data);
      const content = $('#mw-content-text .mw-parser-output p').text().trim();
      originalText = content;
      source = '영어 위키피디아';
      success = true;
    } catch (err) {
      console.warn('⚠️ 영어 위키 실패:', err.message);
    }
  }

  if (!success) {
    try {
      console.log('🌐 Serper 웹 검색 시도');
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: userQuery },
        { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } }
      );
      const first = response.data.organic?.[0]?.snippet;
      if (!first) throw new Error('검색 결과 없음');
      originalText = first;
      source = 'Serper 웹 검색';
      success = true;
    } catch (err) {
      console.error(`❌ Serper 실패: (${userQuery}) →`, err.message);
      return res.status(404).json({ message: '관련 정보를 찾지 못했습니다.' });
    }
  }

  timeMark(`🔸 데이터 수집 완료 → 출처: ${source}`);

  if (isDuplicateSearch(userIp, keyword)) {
    return res.status(429).json({ message: '같은 내용을 너무 자주 검색하고 있어요. 잠시 후 다시 시도해주세요.' });
  }

  logSearch(userIp, userQuery, userId);

  // 5단계: GPT 요약
  const prompt = `
"${userQuery}"라는 주제를 초등학생이 이해할 수 있게 설명해줘.
어려운 단어는 괄호로 간단히 설명해주고, 친절한 말투로 정리해줘.
참고 내용: ${source}

내용:
${originalText.slice(0, 2000)}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 초등학생에게 친절하게 설명하는 도우미야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
    });

    summary = completion.choices[0].message.content.trim();
  } catch (err) {
    return res.status(500).json({ message: '요약 실패', error: err.message });
  }

  timeMark('🔸 GPT 요약 완료');

  // 6단계: 질문 추천
  try {
    const questionGen = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 초등학생의 호기심을 도와주는 질문 선생님이야...' },
        {
          role: 'user',
          content: `아래 내용을 읽은 초등학생이 궁금해할 질문 3개 추천해줘:\n${summary}`
        }
      ],
      temperature: 0.6
    });

    questions = questionGen.choices[0].message.content
      .split('\n')
      .map(q => q.trim().replace(/^\d+\.\s*/, ''))
      .filter(Boolean);
  } catch (err) {
    console.warn('❗ 질문 추천 실패:', err.message);
  }

  timeMark('🔸 질문 추천 완료');

  // 7단계: 정확성 검사
  const isSerper = source === 'Serper 웹 검색';
  const valid = isReliableResult(originalText, summary, userQuery, isSerper);
  if (!valid) {
    console.log('⚠️ 결과 부정확 → 실패 처리');
    return res.status(404).json({ message: '관련된 정보를 찾지 못했습니다.' });
  }

  const totalDuration = Date.now() - totalStart;
  console.log(`✅ 검색 완료 (${userQuery}) → ${totalDuration}ms 소요`);
  res.json({ summary, questions, source, originalText });
});
