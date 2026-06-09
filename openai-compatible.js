export { OpenAICompatibleSttProvider };

const DEBUG_PREFIX = '<Speech Recognition module (OpenAI Compatible)> ';

class OpenAICompatibleSttProvider {
    settings;

    defaultSettings = {
        language: '',
        baseUrl: 'http://localhost:8080/v1',
        apiKey: '',
        model: 'whisper-1',
        streaming: false,
    };

    get settingsHtml() {
        const html = `
        <div id="speech_recognition_openai_compatible_settings">
            <span>Base URL</span><br>
            <input class="text_pole" id="speech_recognition_openai_compatible_base_url" type="text" placeholder="http://localhost:8080/v1"><br>

            <span>API Key <small>(optional)</small></span><br>
            <input class="text_pole" id="speech_recognition_openai_compatible_api_key" type="password" autocomplete="off" placeholder="Optional bearer token"><br>

            <span>Model</span><br>
            <input class="text_pole" id="speech_recognition_openai_compatible_model" type="text" placeholder="whisper-1"><br>

            <label class="checkbox_label" for="speech_recognition_openai_compatible_streaming">
                <input type="checkbox" id="speech_recognition_openai_compatible_streaming" name="speech_recognition_openai_compatible_streaming">
                <small>Request streaming response</small>
            </label>
            <div><i>Uses an OpenAI-compatible audio transcription endpoint: /v1/audio/transcriptions.</i></div>
        </div>`;
        return html;
    }

    onSettingsChange() {
        this.settings.baseUrl = String($('#speech_recognition_openai_compatible_base_url').val() || '').trim();
        this.settings.apiKey = String($('#speech_recognition_openai_compatible_api_key').val() || '').trim();
        this.settings.model = String($('#speech_recognition_openai_compatible_model').val() || '').trim();
        this.settings.streaming = $('#speech_recognition_openai_compatible_streaming').is(':checked');
        console.debug(DEBUG_PREFIX + ' Updated settings: ', { ...this.settings, apiKey: this.settings.apiKey ? '***' : '' });
        this.loadSettings(this.settings);
    }

    loadSettings(settings) {
        if (Object.keys(settings).length == 0) {
            console.debug(DEBUG_PREFIX + 'Using default OpenAI-compatible STT extension settings');
        }

        // Only accept keys defined in defaultSettings.
        this.settings = { ...this.defaultSettings };

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to STT extension: ${key}`;
            }
        }

        $('#speech_recognition_language').val(this.settings.language);
        $('#speech_recognition_openai_compatible_base_url').val(this.settings.baseUrl);
        $('#speech_recognition_openai_compatible_api_key').val(this.settings.apiKey);
        $('#speech_recognition_openai_compatible_model').val(this.settings.model);
        $('#speech_recognition_openai_compatible_streaming').prop('checked', this.settings.streaming);
        console.debug(DEBUG_PREFIX + 'OpenAI-compatible STT settings loaded');
    }

    getTranscriptionUrl() {
        if (!this.settings.baseUrl) {
            toastr.error('OpenAI-compatible base URL is not set.', 'STT Generation Failed (OpenAI Compatible)', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            throw new Error('OpenAI-compatible base URL is not set.');
        }

        const url = new URL(this.settings.baseUrl);
        const normalizedPath = url.pathname.replace(/\/$/, '');
        if (normalizedPath.endsWith('/audio/transcriptions')) {
            url.pathname = normalizedPath;
        } else if (normalizedPath.endsWith('/v1')) {
            url.pathname = `${normalizedPath}/audio/transcriptions`;
        } else {
            url.pathname = `${normalizedPath}/v1/audio/transcriptions`;
        }
        return url;
    }

    getHeaders() {
        const headers = {};

        if (this.settings.apiKey) {
            headers.Authorization = `Bearer ${this.settings.apiKey}`;
        }

        return headers;
    }

    getLanguageName() {
        if (!this.settings.language) {
            return '';
        }

        const selectedOptionText = $('#speech_recognition_language option:selected').text();
        return selectedOptionText && selectedOptionText !== '-- Automatic --'
            ? selectedOptionText
            : this.settings.language;
    }

    getTextFromJson(data) {
        if (!data) {
            return '';
        }

        if (typeof data === 'string') {
            return data;
        }

        if (typeof data.text === 'string') {
            return data.text;
        }

        if (typeof data.transcript === 'string') {
            return data.transcript;
        }

        if (typeof data.delta === 'string') {
            return data.delta;
        }

        const choice = data.choices?.[0];
        if (typeof choice?.text === 'string') {
            return choice.text;
        }

        if (typeof choice?.delta?.content === 'string') {
            return choice.delta.content;
        }

        if (typeof choice?.message?.content === 'string') {
            return choice.message.content;
        }

        return '';
    }

    async readStreamingResponse(response) {
        if (!response.body) {
            const data = await response.json();
            return this.getTextFromJson(data);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let transcript = '';

        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                    continue;
                }

                const payload = trimmedLine.startsWith('data:') ? trimmedLine.slice(5).trim() : trimmedLine;
                if (!payload || payload === '[DONE]') {
                    continue;
                }

                try {
                    transcript += this.getTextFromJson(JSON.parse(payload));
                } catch {
                    transcript += payload;
                }
            }

            if (done) {
                break;
            }
        }

        const finalPayload = buffer.trim();
        if (finalPayload && finalPayload !== '[DONE]') {
            const payload = finalPayload.startsWith('data:') ? finalPayload.slice(5).trim() : finalPayload;
            try {
                transcript += this.getTextFromJson(JSON.parse(payload));
            } catch {
                transcript += payload;
            }
        }

        return transcript;
    }

    async processAudio(audioBlob) {
        if (!this.settings.model) {
            toastr.error('OpenAI-compatible model is not set.', 'STT Generation Failed (OpenAI Compatible)', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            throw new Error('OpenAI-compatible model is not set.');
        }

        const requestData = new FormData();
        requestData.append('file', audioBlob, 'record.wav');
        requestData.append('model', this.settings.model);
        requestData.append('response_format', 'json');

        if (this.settings.language) {
            requestData.append('language', this.getLanguageName());
        }

        if (this.settings.streaming) {
            requestData.append('stream', 'true');
        }

        const apiResult = await fetch(this.getTranscriptionUrl(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: requestData,
        });

        if (!apiResult.ok) {
            toastr.error(apiResult.statusText, 'STT Generation Failed (OpenAI Compatible)', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            throw new Error(`HTTP ${apiResult.status}: ${await apiResult.text()}`);
        }

        if (this.settings.streaming) {
            return this.readStreamingResponse(apiResult);
        }

        const result = await apiResult.json();
        return this.getTextFromJson(result);
    }
}