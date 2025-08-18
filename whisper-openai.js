import { getRequestHeaders } from '../../../../script.js';
export { OpenAISttProvider };

const DEBUG_PREFIX = '<Speech Recognition module (OpenAI)> ';

class OpenAISttProvider {
    settings;

    defaultSettings = {
        language: '',
        model: 'whisper-1',
    };

    get settingsHtml() {
        return `
        <div class="flex-container flexFlowColumn" style="margin-top:8px">
            <label for="openai_model">OpenAI Transcribe model</label>
            <select id="openai_model">
                <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
                <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
                <option value="whisper-1">whisper-1</option>
            </select>
        </div>
        `;
    }

    onSettingsChange() {
        // Used when provider settings are updated from UI
        const model = String($('#openai_model').val());
        this.settings.model = model;
    }

    loadSettings(settings) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.debug(DEBUG_PREFIX + 'Using default OpenAI STT extension settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = { ...this.defaultSettings };
        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to STT extension: ${key}`;
            }
        }

        $('#speech_recognition_language').val(this.settings.language);
        $('#openai_model').val(this.settings.model);
        console.debug(DEBUG_PREFIX + 'OpenAI STT settings loaded', this.settings);
    }

    async processAudio(audioBlob) {
        const requestData = new FormData();
        requestData.append('avatar', audioBlob, 'record.wav');

        requestData.append('model', this.settings.model || this.defaultSettings.model);

        if (this.settings.language) {
            requestData.append('language', this.settings.language);
        }

        // It's not a JSON, let fetch set the content type
        const headers = getRequestHeaders();
        delete headers['Content-Type'];
        console.debug(DEBUG_PREFIX + 'Model STT: ', this.settings.model)

        const apiResult = await fetch('/api/openai/transcribe-audio', {
            method: 'POST',
            headers: headers,
            body: requestData,
        });

        if (!apiResult.ok) {
            toastr.error(apiResult.statusText, 'STT Generation Failed (OpenAI)', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            throw new Error(`HTTP ${apiResult.status}: ${await apiResult.text()}`);
        }

        const result = await apiResult.json();
        return result.text;
    }

}
