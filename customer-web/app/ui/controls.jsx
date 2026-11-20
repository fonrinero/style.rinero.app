'use client';
import { useEffect, useState } from 'react';
import { useLocale } from './language-provider';

export default function Controls() {
  const { language, setLanguage } = useLocale();
  const [light, setLight] = useState(false);
  useEffect(() => {
    const savedLight = localStorage.getItem('style-theme') === 'light';
    setLight(savedLight);
    document.documentElement.dataset.theme = savedLight ? 'light' : 'dark';
  }, []);
  function changeLanguage(event) {
    const next = event.target.value;
    setLanguage(next); localStorage.setItem('style-language', next);
    document.documentElement.lang = next;
  }
  function toggleTheme() {
    const next = !light; setLight(next); localStorage.setItem('style-theme', next ? 'light' : 'dark'); document.documentElement.dataset.theme = next ? 'light' : 'dark';
  }
  return <><select value={language} onChange={changeLanguage} aria-label={language === 'el' ? 'Γλώσσα' : language === 'es' ? 'Idioma' : 'Language'}><option value="en">EN</option><option value="el">ΕΛ</option><option value="es">ES</option></select><button className="icon-button" onClick={toggleTheme} aria-label={language === 'el' ? 'Αλλαγή θέματος' : language === 'es' ? 'Cambiar tema' : 'Change theme'}>{light ? '☾' : '☼'}</button></>;
}
