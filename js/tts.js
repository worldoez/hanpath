/* Hanpath — Chinese text-to-speech via the Web Speech API. zh-CN for
Mandarin mode, zh-HK for Cantonese mode. */
"use strict";

const TTS = {
  voices: {},   // lang -> voice

  init() {
    if (!("speechSynthesis" in window)) return;
    const pick = () => {
      const zh = speechSynthesis.getVoices().filter(v => /^zh|Chinese/i.test(v.lang) || /Chinese|普通话|中文|汉语/.test(v.name));
      if (!zh.length) return;
      // Mandarin: prefer zh-CN; Cantonese: prefer zh-HK / yue / known HK voices
      this.voices.zh = zh.find(v => /-CN|cmn|Hui|Yaoyao|Tingting|Xiaoxiao/i.test(v.lang + v.name)) || zh[0];
      this.voices.yue = zh.find(v => /-HK|yue|Sinji|Sin-ji|Gooyit|Gaooyau/i.test(v.lang + v.name)) || null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  },

  speak(text, rate, lang) {
    if (!("speechSynthesis" in window)) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "yue" ? "zh-HK" : "zh-CN";
    u.rate = rate || 0.9;
    const v = this.voices[lang === "yue" ? "yue" : "zh"];
    if (v) u.voice = v;
    speechSynthesis.speak(u);
    return true;
  },
};
TTS.init();