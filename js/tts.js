/* Hanpath — Mandarin text-to-speech via the Web Speech API. */
"use strict";

const TTS = {
  voice: null,

  init() {
    if (!("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices().filter(v => /^zh|Chinese/i.test(v.lang) || /Chinese|普通话|中文|汉语/.test(v.name));
      if (!voices.length) return;
      // prefer zh-CN, then any Chinese voice
      this.voice = voices.find(v => /-CN|cmn|Hui|Yaoyao|Tingting|Sinji/i.test(v.lang + v.name)) || voices[0];
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  },

  speak(text, rate) {
    if (!("speechSynthesis" in window)) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate || 0.9;
    if (this.voice) u.voice = this.voice;
    speechSynthesis.speak(u);
    return true;
  },
};
TTS.init();