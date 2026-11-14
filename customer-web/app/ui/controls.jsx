'use client';
import { useEffect, useState } from 'react';

export default function Controls() {
  const [language, setLanguage] = useState('en');
  const [light, setLight] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('style-language');
    const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
    setLanguage(saved || (['en', 'el', 'es'].includes(browser) ? browser : 'en'));
    setLight(localStorage.getItem('style-theme') === 'light');
  }, []);
  function changeLanguage(event) {
    const next = event.target.value;
    setLanguage(next); localStorage.setItem('style-language', next);
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent('style-language', { detail: next }));
  }
  function toggleTheme() {
    const next = !light; setLight(next); localStorage.setItem('style-theme', next ? 'light' : 'dark'); document.documentElement.dataset.theme = next ? 'light' : 'dark';
  }
  return <><select value={language} onChange={changeLanguage} aria-label="Language"><option value="en">EN</option><option value="el">ΕΛ</option><option value="es">ES</option></select><button className="icon-button" onClick={toggleTheme} aria-label="Change theme">{light ? '☾' : '☼'}</button></>;
}
