/**
 * Voice Feedback — Text-to-Speech using the Web Speech API.
 */

export class VoiceFeedback {
    constructor() {
        this._enabled = true;
        this._synth = window.speechSynthesis || null;
        this._lastMessage = '';
        this._lastTime = 0;
        this._cooldown = 1500; // ms between same messages
    }

    get enabled() { return this._enabled; }
    set enabled(val) { this._enabled = val; }

    /**
     * Speak a message. Deduplicates rapid-fire identical messages.
     */
    speak(message) {
        if (!this._enabled || !this._synth) return;

        const now = Date.now();
        if (message === this._lastMessage && now - this._lastTime < this._cooldown) return;

        // Cancel any currently speaking utterance to avoid queue buildup
        this._synth.cancel();

        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        // Prefer a natural-sounding English voice
        const voices = this._synth.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural'))
            || voices.find(v => v.lang.startsWith('en'))
            || voices[0];
        if (preferred) utterance.voice = preferred;

        this._synth.speak(utterance);
        this._lastMessage = message;
        this._lastTime = now;
    }
}
