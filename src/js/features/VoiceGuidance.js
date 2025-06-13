export class VoiceGuidance {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.isEnabled = true;
    this.lastAnnouncement = '';
    this.initializeVoice();
  }

  async initializeVoice() {
    if (this.synth.getVoices().length === 0) {
      await new Promise(resolve => {
        this.synth.addEventListener('voiceschanged', resolve, { once: true });
      });
    }
    
    const voices = this.synth.getVoices();
    this.voice = voices.find(voice => 
      voice.name.includes('Google') && voice.lang.includes('en')
    ) || voices[0];
  }

  speak(text, priority = false) {
    if (!this.isEnabled || text === this.lastAnnouncement) return;
    
    this.synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    this.synth.speak(utterance);
    this.lastAnnouncement = text;
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled) {
      this.synth.cancel();
    }
    return this.isEnabled;
  }
} 