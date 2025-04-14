import React, { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';


const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

let userId = localStorage.getItem('userId');
if (!userId) {
  userId = crypto.randomUUID(); // 또는 uuid 라이브러리도 가능
  localStorage.setItem('userId', userId);
}

function App() {
  const [keyword, setKeyword] = useState('');
  const [summary, setSummary] = useState('');
  const [initialResult, setInitialResult] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const [usedQuestions, setUsedQuestions] = useState([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [context, setContext] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');



  const handleSearch = async (query, preserveQuestions = false) => {
    const rawInput = query || keyword;
    if (!rawInput.trim()) return;

    setLoading(true);
    setLoadingMessage('🌏 인터넷에서 정보 찾는 중...');
    setError('');
    setSummary('');
    setSource('');
    setQuestionAnswer('');
    setCurrentQuestion('');
    setIsQuestionMode(false);

    if (!preserveQuestions) {
      setAllQuestions([]);
      setUsedQuestions([]);
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/search`, { keyword: rawInput, headers: { 'x-user-id': userId }
      }, );
      setSummary(response.data.summary);
      setInitialResult(response.data.summary);
      setSource(response.data.source);
      setContext(response.data.originalText || '');
      if (!preserveQuestions) {
        setAllQuestions(response.data.questions || []);
      }
    } catch (err) {
      const msg = err.response?.data?.message || '검색 중 오류가 발생했습니다.';
      setError(msg);
      setErrorMessage(msg); 
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionClick = async (question) => {
    if (!context) {
      alert("본문 정보가 부족해요. 먼저 검색을 다시 해주세요.");
      return;
    }
    setUsedQuestions((prev) => [...prev, question]);
    setLoading(true);
    setLoadingMessage('🤖 AI가 질문에 답변하는 중이에요...');
    setCurrentQuestion(question);
    setQuestionAnswer('');
    setIsQuestionMode(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/question`, {
        context,
        question
      }
    ,{ headers: { 'x-user-id': userId } });
      setQuestionAnswer(response.data.answer);
    } catch (err) {
      console.error('❌ 질문 응답 실패:', err);
      setError('질문 응답 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setKeyword('');
    setSummary('');
    setSource('');
    setAllQuestions([]);
    setUsedQuestions([]);
    setQuestionAnswer('');
    setCurrentQuestion('');
    setIsQuestionMode(false);
    setInitialResult(null);
    setContext('');
    setError('');
  };

  const returnToInitialSummary = () => {
    setSummary(initialResult);
    setIsQuestionMode(false);
    setQuestionAnswer('');
    setCurrentQuestion('');
  };

  const unusedQuestions = allQuestions.filter((q) => !usedQuestions.includes(q)).slice(0, 3);

return (
  <div className="App">

    {errorMessage && (
      <div className="popup-overlay">
        <div className="popup-notice">
          <h3>⚠️ 안내</h3>
          <p>{errorMessage}</p>
          <button className="confirm-btn" onClick={() => setErrorMessage('')}>확인</button>
        </div>
      </div>
    )}

    {showNotice && (
      <div className="popup-overlay">
        <div className="popup-notice">
          <h3>📌 사용 전에 꼭 읽어주세요!</h3>
          <ul>
            <li>AI가 알려주는 정보는 항상 정답이 아닐 수 있어요.</li>
            <li>꼭 선생님과 함께 사용하세요.</li>
            <li>이름, 주소, 학교 같은 개인정보는 절대 입력하지 마세요!</li>
            <li>검색은 너무 자주 하지 않도록 해요.</li>
          </ul>
          <button className="confirm-btn" onClick={() => setShowNotice(false)}>확인했어요</button>
        </div>
      </div>
    )}
      <h1>🔍 초등학생을 위한 AI 검색 도우미</h1>

      <div className="search-box">
        <input
          type="text"
          placeholder="조사할 내용을 입력하세요..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isQuestionMode && handleSearch()}
        />
        <button onClick={() => !isQuestionMode && handleSearch()}>검색</button>
        <button onClick={resetAll}>🏠 처음으로</button>
      </div>

      {loading && (
        <div className="loading">
          <p>{loadingMessage}</p>
          <div>
            <span></span><span></span><span></span>
          </div>
        </div>
      )}

      {!isQuestionMode && summary && (
        <div className="result">
          <div className="source-box">📚 이번 정보는 <strong>{source}</strong>에서 찾았어요!</div>
          <div className="summary">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {isQuestionMode && questionAnswer && (
        <div className="result">
          <div className="source-box">❓ <strong>{currentQuestion}</strong></div>
          <div className="summary">
            <ReactMarkdown>{questionAnswer}</ReactMarkdown>
          </div>
          {initialResult && (
            <button onClick={returnToInitialSummary}>🔙 원래 요약 보기</button>
          )}
        </div>
      )}


      {unusedQuestions.length > 0 && (
        <div className="questions">
          <h3>🤔 더 궁금한 점은?</h3>
          <ul>
            {unusedQuestions.map((q, index) => (
              <li key={index}>
                <button onClick={() => handleQuestionClick(q)}>{q}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      

      {showAbout && (
        <div className={`popup ${showAbout ? 'show' : ''}`}>
          <div className="popup-inner">
            <h3>초등학생을 위한 AI 검색 도우미</h3>
            <p>제작: 인디스쿨 아반즈</p>
            <p>cyeons@gne.go.kr</p>
            <button onClick={() => setShowAbout(false)}>닫기</button>
          </div>
        </div>
      )}

      <div className="about-link" onClick={() => setShowAbout(true)}>About</div>
    </div>
  );
}

export default App;
