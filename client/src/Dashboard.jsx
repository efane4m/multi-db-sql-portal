import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
  const [dbs, setDbs] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [query, setQuery] = useState('SELECT * FROM stores_store;');
  const [result, setResult] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeader = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };

  useEffect(() => {
    axios.get('http://localhost:8000/api/databases/', authHeader)
      .then(res => {
        setDbs(res.data.databases);
        if(res.data.databases.length > 0) setSelectedDb(res.data.databases[0]);
      });
  }, []);

  const executeQuery = () => {
    setLoading(true); setResult(null);
    axios.post('http://localhost:8000/api/query/', { db_name: selectedDb, query }, authHeader)
      .then(res => { setResult(res.data.data); setIsCached(res.data.cached); })
      .catch(err => {
        // Выводим в консоль браузера ВСЮ ошибку для отладки
        console.error("Ошибка при запросе:", err); 
        
        // Пытаемся достать текст ошибки из ответа сервера
        const errorMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Неизвестная ошибка';
        alert(`Ошибка: ${errorMsg}`);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ padding: '50px', fontFamily: 'Arial' }}>
      <h2>Работа с БД</h2>
      <div>
        <label>Выберите базу: </label>
        <select value={selectedDb} onChange={e => setSelectedDb(e.target.value)}>
          {dbs.map(db => <option key={db} value={db}>{db}</option>)}
        </select>
      </div>
      <h3>SQL Запрос (только SELECT)</h3>
      <textarea rows="5" cols="80" value={query} onChange={e => setQuery(e.target.value)} style={{ padding: '10px', fontFamily: 'monospace' }}/>
      <br />
      <button onClick={executeQuery} disabled={loading} style={{ marginTop: '10px', padding: '5px 15px' }}>
        {loading ? 'Выполняется...' : 'Выполнить'}
      </button>

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h4>Результат {isCached && <span style={{color: 'green', fontSize: '14px'}}>(Взято из кэша Redis)</span>}</h4>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr>{result.length > 0 && Object.keys(result[0]).map(k => <th key={k} style={{background: '#f0f0f0'}}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {result.map((row, i) => (
                <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}